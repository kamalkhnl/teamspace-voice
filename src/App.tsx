import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import Peer from 'peerjs';
import { 
  Mic, MicOff, LogOut, Sun, Moon, 
  Monitor, Volume2, Building2, Users, 
  MapPin, Headphones, ArrowRight, Check, ChevronUp
} from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** * UTILITIES 
 */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getRandomColor = () => {
  const colors = ['#00e4b8', '#9b6dff', '#5b9aff', '#f472b6', '#fbbf24', '#ff6b6b'];
  return colors[Math.floor(Math.random() * colors.length)];
};

/**
 * TYPES
 */
interface Position { x: number; y: number; }

interface RemotePlayer {
  id: string;
  name: string;
  pos: Position;
  roomId: string | null;
  peerId: string;
  color: string;
  isSpeaking: boolean;
  audioEnabled?: boolean;
}

interface AudibleUser {
  id: string;
  name: string;
  distance: number;
  volume: number;
  color: string;
  isSpeaking: boolean;
  roomId: string | null;
  peerId?: string;
}

const MIC_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  // Aggressive AGC can introduce pumping/rippling artifacts.
  autoGainControl: false,
  channelCount: 1,
  sampleRate: 48000,
};

const PLAYBACK_ATTENUATION = 0.72;
const LOCAL_TALK_DUCKING = 0.18;
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ],
  },
];
const CALL_CONNECT_TIMEOUT_MS = 8000;

function getClientInstanceId(): string {
  if (typeof window === 'undefined') return Math.random().toString(36).slice(2);

  const existing = window.sessionStorage.getItem('client-instance-id');
  if (existing) return existing;

  const generated = crypto.randomUUID();
  window.sessionStorage.setItem('client-instance-id', generated);
  return generated;
}

function getDeviceLabel(device: MediaDeviceInfo, fallbackPrefix: string): string {
  const label = device.label?.trim();
  return label || `${fallbackPrefix} ${device.deviceId.slice(0, 6)}`;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value == null || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseIceServersFromEnv(): RTCIceServer[] {
  const rawIceServers = import.meta.env.VITE_PEER_ICE_SERVERS?.trim();
  if (!rawIceServers) return DEFAULT_ICE_SERVERS;

  try {
    const parsed = JSON.parse(rawIceServers);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    console.warn('VITE_PEER_ICE_SERVERS must be a non-empty JSON array. Falling back to default STUN.');
  } catch (error) {
    console.warn('Failed to parse VITE_PEER_ICE_SERVERS. Falling back to default STUN.', error);
  }

  return DEFAULT_ICE_SERVERS;
}

async function resolveIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch('/api/ice-servers', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`ICE server endpoint returned ${res.status}`);
    }

    const data = await res.json();
    if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
      return data.iceServers;
    }

    throw new Error('ICE server endpoint returned no iceServers');
  } catch (error) {
    console.warn('Falling back to static ICE server configuration.', error);
    return parseIceServersFromEnv();
  }
}

function buildPeerOptions(iceServers: RTCIceServer[]) {
  const options: Record<string, unknown> = {
    config: { iceServers },
    debug: 1,
  };

  const host = import.meta.env.VITE_PEER_HOST?.trim();
  const path = import.meta.env.VITE_PEER_PATH?.trim();
  const portRaw = import.meta.env.VITE_PEER_PORT?.trim();
  const secure = parseBooleanEnv(import.meta.env.VITE_PEER_SECURE);

  if (host) {
    options.host = host;
  } else if (typeof window !== 'undefined') {
    // Default to the current origin so PeerJS signaling stays on this app host
    // instead of falling back to the public PeerJS cloud server.
    options.host = window.location.hostname;
    if (window.location.port) {
      const currentPort = Number(window.location.port);
      if (!Number.isNaN(currentPort)) options.port = currentPort;
    }
    options.secure = window.location.protocol === 'https:';
  }
  if (path) options.path = path;
  if (portRaw) {
    const port = Number(portRaw);
    if (!Number.isNaN(port)) options.port = port;
  }
  if (secure !== undefined) options.secure = secure;

  return options;
}

function buildPreferredMicConstraints(): MediaTrackConstraints {
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() ?? {};
  const constraints: Record<string, unknown> = {};

  if (supported.echoCancellation) constraints.echoCancellation = { ideal: 'all' };
  if (supported.noiseSuppression) constraints.noiseSuppression = { ideal: true };
  if (supported.autoGainControl) constraints.autoGainControl = { ideal: false };
  if (supported.channelCount) constraints.channelCount = { ideal: 1, max: 1 };
  if (supported.sampleRate) constraints.sampleRate = { ideal: 48000 };
  if (supported.sampleSize) constraints.sampleSize = { ideal: 16 };
  if (supported.latency) constraints.latency = { ideal: 0.01 };

  return Object.keys(constraints).length > 0
    ? (constraints as MediaTrackConstraints)
    : MIC_AUDIO_CONSTRAINTS;
}

async function tuneMicTrack(track: MediaStreamTrack): Promise<void> {
  if ('contentHint' in track) {
    try {
      track.contentHint = 'speech';
    } catch {}
  }

  if (!track.applyConstraints) return;

  const supported = navigator.mediaDevices?.getSupportedConstraints?.() ?? {};
  const base: Record<string, unknown> = {};

  if (supported.noiseSuppression) base.noiseSuppression = true;
  if (supported.autoGainControl) base.autoGainControl = false;
  if (supported.channelCount) base.channelCount = 1;
  if (supported.sampleRate) base.sampleRate = 48000;
  if (supported.sampleSize) base.sampleSize = 16;
  if (supported.latency) base.latency = 0.01;

  const attempts: MediaTrackConstraints[] = [];

  if (supported.echoCancellation) {
    attempts.push({ ...base, echoCancellation: { ideal: 'all' } } as MediaTrackConstraints);
    attempts.push({ ...base, echoCancellation: { ideal: 'remote-only' } } as MediaTrackConstraints);
    attempts.push({ ...base, echoCancellation: true } as MediaTrackConstraints);
  } else if (Object.keys(base).length > 0) {
    attempts.push(base as MediaTrackConstraints);
  }

  for (const constraints of attempts) {
    try {
      await track.applyConstraints(constraints);
      return;
    } catch {}
  }

  await track
    .applyConstraints({
      advanced: [
        {
          googEchoCancellation: true,
          googNoiseSuppression: true,
          googAutoGainControl: false,
          googHighpassFilter: true,
        } as any,
      ],
    } as any)
    .catch(() => undefined);
}

/**
 * OFFICE DATA & LAYOUT
 */
const MAP_WIDTH = 1200;
const MAP_HEIGHT = 800;

const generateSeats = (count: number, startX: number, startY: number, spacing: number, dir: 'up' | 'down' | 'left' | 'right', tableBase: { x: number, y: number, w: number, h: number }) => {
  return Array(count).fill(0).map((_, i) => {
    const isHorizontal = dir === 'up' || dir === 'down';
    const x = isHorizontal ? startX + (i * spacing) : startX;
    const y = isHorizontal ? startY : startY + (i * spacing);
    let cx = x, cy = y, mx = x, my = y, bx = x, by = y;
    if (dir === 'down') { cy = tableBase.y - 25; mx = x; my = tableBase.y + 16; by = cy - 10; } 
    else if (dir === 'up') { cy = tableBase.y + tableBase.h + 25; mx = x; my = tableBase.y + tableBase.h - 16; by = cy + 10; } 
    else if (dir === 'right') { cx = tableBase.x - 25; mx = tableBase.x + 16; my = y; bx = cx - 10; } 
    else if (dir === 'left') { cx = tableBase.x + tableBase.w + 25; mx = tableBase.x + tableBase.w - 16; my = y; bx = cx + 10; }
    return { id: `seat-${dir}-${cx}-${cy}`, cx, cy, mx, my, bx, by, dir };
  });
};

const ZONES = [
  {
    id: 'art', name: 'Art Department',
    bounds: { x: 40, y: 80, w: 430, h: 370 },
    tables: [{ x: 70, y: 130, w: 370, h: 80 }, { x: 70, y: 320, w: 370, h: 80 }],
    seats: [
      ...generateSeats(4, 120, 0, 90, 'down', { x: 70, y: 130, w: 370, h: 80 }),
      ...generateSeats(4, 120, 0, 90, 'up', { x: 70, y: 130, w: 370, h: 80 }),
      ...generateSeats(4, 120, 0, 90, 'down', { x: 70, y: 320, w: 370, h: 80 }),
      ...generateSeats(4, 120, 0, 90, 'up', { x: 70, y: 320, w: 370, h: 80 })
    ]
  },
  { id: 'art-mgr', name: 'Art Manager', bounds: { x: 40, y: 480, w: 130, h: 180 }, tables: [{ x: 80, y: 530, w: 70, h: 100 }], seats: [...generateSeats(1, 0, 580, 0, 'right', { x: 80, y: 530, w: 70, h: 100 })] },
  { id: 'proj-mgr', name: 'Project Manager', bounds: { x: 190, y: 480, w: 130, h: 180 }, tables: [{ x: 230, y: 530, w: 70, h: 100 }], seats: [...generateSeats(1, 0, 580, 0, 'right', { x: 230, y: 530, w: 70, h: 100 })] },
  { id: 'conf-a', name: 'Meeting Room A', bounds: { x: 340, y: 480, w: 140, h: 180 }, tables: [{ x: 380, y: 530, w: 60, h: 110 }], seats: [...generateSeats(5, 0, 540, 22, 'right', { x: 380, y: 530, w: 60, h: 110 }), ...generateSeats(5, 0, 540, 22, 'left', { x: 380, y: 530, w: 60, h: 110 })] },
  { id: 'game-web', name: 'Game & Marketing', bounds: { x: 500, y: 80, w: 180, h: 370 }, tables: [{ x: 550, y: 150, w: 80, h: 240 }], seats: [...generateSeats(3, 0, 180, 70, 'right', { x: 550, y: 150, w: 80, h: 240 }), ...generateSeats(3, 0, 180, 70, 'left', { x: 550, y: 150, w: 80, h: 240 })] },
  { id: 'hr', name: 'Human Resources', bounds: { x: 710, y: 80, w: 120, h: 170 }, tables: [{ x: 730, y: 150, w: 80, h: 80 }], seats: [...generateSeats(1, 770, 0, 0, 'down', { x: 730, y: 150, w: 80, h: 80 })] },
  { id: 'account', name: 'Accounting', bounds: { x: 850, y: 80, w: 120, h: 170 }, tables: [{ x: 870, y: 150, w: 80, h: 80 }], seats: [...generateSeats(1, 910, 0, 0, 'down', { x: 870, y: 150, w: 80, h: 80 })] },
  { id: 'it', name: 'IT Department', bounds: { x: 710, y: 280, w: 120, h: 170 }, tables: [{ x: 730, y: 350, w: 80, h: 80 }], seats: [...generateSeats(1, 770, 0, 0, 'down', { x: 730, y: 350, w: 80, h: 80 })] },
  { id: 'facility', name: 'Facilities', bounds: { x: 850, y: 280, w: 120, h: 170 }, tables: [{ x: 870, y: 350, w: 80, h: 80 }], seats: [...generateSeats(1, 910, 0, 0, 'down', { x: 870, y: 350, w: 80, h: 80 })] },
  { id: 'ai', name: 'Simulation & AI', bounds: { x: 500, y: 480, w: 180, h: 180 }, tables: [{ x: 550, y: 540, w: 80, h: 80 }], seats: [...generateSeats(1, 0, 580, 80, 'right', { x: 550, y: 540, w: 80, h: 80 }), ...generateSeats(1, 0, 580, 80, 'left', { x: 550, y: 540, w: 80, h: 80 })] },
  { id: 'conf-b', name: 'Meeting Room B', bounds: { x: 710, y: 480, w: 260, h: 180 }, tables: [{ x: 750, y: 550, w: 180, h: 60 }], seats: [...generateSeats(4, 765, 0, 45, 'down', { x: 750, y: 550, w: 180, h: 60 }), ...generateSeats(4, 765, 0, 45, 'up', { x: 750, y: 550, w: 180, h: 60 })] }
];

const SPAWN_POSITION = { x: 485, y: 460 };

function isWalkable(x: number, y: number): boolean {
  if (x < 0 || x > MAP_WIDTH || y < 0 || y > MAP_HEIGHT) return false;
  for (const zone of ZONES) {
    for (const table of zone.tables) {
      if (x >= table.x && x <= table.x + table.w && y >= table.y && y <= table.y + table.h) return false;
    }
  }
  return true;
}

function getZoneAtPosition(pos: { x: number, y: number }): string | null {
  const zone = ZONES.find(z => 
    pos.x >= z.bounds.x && pos.x <= z.bounds.x + z.bounds.w && 
    pos.y >= z.bounds.y && pos.y <= z.bounds.y + z.bounds.h
  );
  return zone?.id || null;
}

function getZoneById(id: string) { return ZONES.find(z => z.id === id); }
function distance(a: { x: number, y: number }, b: { x: number, y: number }): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function getRandomSpawn(): Position {
  let attempts = 0;
  while (attempts < 100) {
    const x = 50 + Math.random() * (MAP_WIDTH - 100);
    const y = 50 + Math.random() * (MAP_HEIGHT - 100);
    if (isWalkable(x, y) && !getZoneAtPosition({ x, y })) return { x, y };
    attempts++;
  }
  return SPAWN_POSITION;
}

/**
 * AUDIO ENGINE
 */
class SpatialAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private outputDeviceId = 'default';
  private userNodes: Map<string, { 
    source: MediaElementAudioSourceNode; 
    gain: GainNode; 
    panner: PannerNode; 
    stream: MediaStream;
    audioEl: HTMLAudioElement; 
  }> = new Map();

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    // Standardize listener orientation
    if (this.ctx.listener.forwardX) {
      this.ctx.listener.forwardX.setValueAtTime(0, this.ctx.currentTime);
      this.ctx.listener.forwardY.setValueAtTime(0, this.ctx.currentTime);
      this.ctx.listener.forwardZ.setValueAtTime(-1, this.ctx.currentTime);
      this.ctx.listener.upX.setValueAtTime(0, this.ctx.currentTime);
      this.ctx.listener.upY.setValueAtTime(1, this.ctx.currentTime);
      this.ctx.listener.upZ.setValueAtTime(0, this.ctx.currentTime);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId;

    await Promise.all(
      Array.from(this.userNodes.values()).map(({ audioEl }) => {
        const sinkTarget = deviceId === 'default' ? '' : deviceId;
        const sinkSetter = (audioEl as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }).setSinkId;
        return sinkSetter ? sinkSetter.call(audioEl, sinkTarget) : Promise.resolve();
      })
    );
  }

  addRemoteStream(id: string, stream: MediaStream): void {
    if (!this.ctx || !this.masterGain) return;
    this.removeUser(id);
    
    // Route the remote stream through a media element first so the browser can
    // treat it like normal playback while we still keep spatial positioning.
    const audioEl = new Audio();
    audioEl.srcObject = stream;
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.disableRemotePlayback = true;
    audioEl.muted = false;
    audioEl.volume = 1;
    const sinkSetter = (audioEl as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }).setSinkId;
    if (sinkSetter) {
      const sinkTarget = this.outputDeviceId === 'default' ? '' : this.outputDeviceId;
      sinkSetter.call(audioEl, sinkTarget).catch((e) => console.warn('Failed to set audio output device', e));
    }
    
    // Ensure context is running when a new stream arrives
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const source = this.ctx.createMediaElementSource(audioEl);
    const gain = this.ctx.createGain();
    const panner = this.ctx.createPanner();
    
    gain.gain.value = 0;
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 50;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1.5;
    
    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);

    audioEl.play().catch(e => console.warn("Autoplay blocked for remote audio", e));
    
    this.userNodes.set(id, { source, gain, panner, stream, audioEl });
  }

  updateUser(userId: string, listenerPos: Position, sourcePos: Position, canHear: boolean, volume: number): void {
    const nodes = this.userNodes.get(userId);
    if (!nodes || !this.ctx) return;
    const dx = (sourcePos.x - listenerPos.x) / 100;
    const dy = (sourcePos.y - listenerPos.y) / 100;
    nodes.panner.positionX.setTargetAtTime(dx, this.ctx.currentTime, 0.1);
    nodes.panner.positionZ.setTargetAtTime(dy, this.ctx.currentTime, 0.1);
    nodes.panner.positionY.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    // volume is already 0 when out of range; canHear controls smooth on/off
    const targetGain = canHear ? volume : 0;
    nodes.gain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.15);
  }

  setMuted(muted: boolean): void {
    if (this.masterGain && this.ctx) this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.1);
  }

  removeUser(id: string): void {
    const nodes = this.userNodes.get(id);
    if (nodes) {
      try { 
        nodes.source.disconnect(); 
        nodes.gain.disconnect(); 
        nodes.panner.disconnect(); 
        nodes.audioEl.pause();
        nodes.audioEl.srcObject = null;
      } catch (e) {}
      this.userNodes.delete(id);
    }
  }

  destroy(): void {
    this.userNodes.forEach((_, id) => this.removeUser(id));
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
    this.masterGain = null;
  }
}

/**
 * COMPONENTS
 */

const JoinScreen = ({ onJoin }: { onJoin: (name: string) => void }) => {
  const [name, setName] = useState('');
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onJoin(name.trim());
  };

  const tips = [
    { icon: <Monitor className="w-4 h-4" />, text: 'Move with WASD or double-click to walk' },
    { icon: <Building2 className="w-4 h-4" />, text: 'Walk into specific rooms for meetings' },
    { icon: <Volume2 className="w-4 h-4" />, text: 'Spatial audio — voices fade with distance' },
  ];

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[var(--color-bg-primary)] relative overflow-hidden font-sans text-[var(--color-text-primary)]">
      <div className="absolute inset-0 pointer-events-none opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, var(--color-border-light) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-accent)] rounded-full mix-blend-multiply filter blur-[128px] opacity-10 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--color-accent-blue)] rounded-full mix-blend-multiply filter blur-[128px] opacity-10 animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="w-full max-w-md mx-4 relative z-10 flex flex-col transition-all duration-700" style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(20px)' }}>
        <div className="bg-[var(--color-bg-card)]/80 backdrop-blur-xl border border-[var(--color-border)] p-8 rounded-3xl shadow-xl">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-blue)] flex items-center justify-center shadow-lg shadow-[var(--color-accent-dim)] mb-6">
              <span className="text-white font-extrabold text-3xl tracking-tighter">P</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] mb-2">Paracosma</h1>
            <p className="text-[var(--color-text-secondary)] text-sm font-medium">Virtual Office & Collaboration Space</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider ml-1">Display Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="E.g. Jane Doe" className="w-full px-5 py-4 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-4 focus:ring-[var(--color-accent-dim)] transition-all" autoFocus maxLength={20} />
            </div>
            <button type="submit" disabled={!name.trim()} className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold transition-all disabled:opacity-50 shadow-lg" style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-blue))' }}>
              Enter Workspace <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>
        <div className="mt-8 px-4 grid grid-cols-1 gap-4 text-sm text-[var(--color-text-secondary)]">
          {tips.map((tip, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)]">{tip.icon}</div>
              <span className="font-medium leading-tight">{tip.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ userName, userRoom, allPlayers, audibleUsers, audioEnabled, onHearingRangeChange, hearingRange }: { userName: string, userRoom: string | null, allPlayers: RemotePlayer[], audibleUsers: AudibleUser[], audioEnabled: boolean, onHearingRangeChange: (val: number) => void, hearingRange: number }) => {
  const currentZoneName = userRoom ? getZoneById(userRoom)?.name : 'Open Floor';
  const adminZones = ['hr', 'account', 'it', 'facility', 'art-mgr', 'proj-mgr'];
  const artZones = ['art'];
  const techZones = ['game-web', 'ai'];

  const groups = [
    { name: 'Admin Team', players: allPlayers.filter(p => p.roomId && adminZones.includes(p.roomId)) },
    { name: 'Art Department', players: allPlayers.filter(p => p.roomId && artZones.includes(p.roomId)) },
    { name: 'Game, Marketing, Web, AI', players: allPlayers.filter(p => p.roomId && techZones.includes(p.roomId)) },
    { name: 'Open Floor & Meetings', players: allPlayers.filter(p => !p.roomId || (!adminZones.includes(p.roomId) && !artZones.includes(p.roomId) && !techZones.includes(p.roomId))) }
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[var(--color-bg-card)] text-[var(--color-text-primary)]">
      <div className="p-3 border-b border-[var(--color-border)] flex items-center justify-between shrink-0 bg-[var(--color-bg-secondary)]/30">
        <h3 className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Directory</h3>
        <span className="text-[9px] font-semibold text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] px-2 py-0.5 rounded-full border border-[var(--color-border)]">{allPlayers.length + 1} Online</span>
      </div>
      <div className="p-2 border-b border-[var(--color-border)] shrink-0 bg-[var(--color-bg-card)] shadow-sm z-20">
        <div className="flex items-center gap-2 p-1.5 rounded-md bg-[var(--color-bg-secondary)] border border-[var(--color-border)]">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold bg-gradient-to-tr from(--color-accent) to(--color-accent-blue) text-white">{userName.substring(0, 2).toUpperCase()}</div>
          <div className="flex-1 min-w-0 overflow-hidden flex flex-col justify-center">
            <p className="text-xs font-semibold truncate leading-none">{userName} <span className="text-[9px] font-normal text-[var(--color-text-muted)] ml-1">(You)</span></p>
            <div className="flex items-center gap-1 mt-1 text-[9px] text-[var(--color-text-secondary)] truncate leading-none">
              <MapPin className="w-2.5 h-2.5 text-[var(--color-accent)] flex-shrink-0" />
              <span className="truncate">{currentZoneName}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2.5 min-h-0">
        {allPlayers.length === 0 ? <div className="text-[11px] text-[var(--color-text-muted)] text-center py-4 italic opacity-70">No one else online</div> : 
          groups.map(g => (
            <div key={g.name} className="flex flex-col gap-0.5 shrink-0">
              <div className="sticky top-0 bg-[var(--color-bg-card)]/95 backdrop-blur z-10 py-1 flex items-center justify-between border-b border-[var(--color-border)]/50 mb-0.5">
                <h4 className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{g.name}</h4>
                <span className="text-[8px] font-bold text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] px-1.5 py-0.5 rounded-full">{g.players.length}</span>
              </div>
              {g.players.length === 0 ? <div className="text-[9px] text-[var(--color-text-muted)]/50 px-1.5 py-1 italic">Empty</div> : 
                g.players.map(p => {
                  const audible = audibleUsers.find(a => a.id === p.id);
                  const pZoneName = p.roomId ? getZoneById(p.roomId)?.name : 'Open Floor';
                  return (
                    <div key={p.id} className={cn("shrink-0 flex items-center gap-2 p-1.5 rounded-md transition-all w-full max-w-full overflow-hidden", audible ? "bg-[var(--color-bg-secondary)]/50 border border-[var(--color-border)]" : "hover:bg-[var(--color-bg-secondary)]/30 border border-transparent opacity-80")}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: p.color + '22', color: p.color, border: `1px solid ${p.color}44` }}>{p.name.substring(0, 2).toUpperCase()}</div>
                      <div className="flex-1 min-w-0 overflow-hidden flex flex-col justify-center">
                        <div className="flex items-center justify-between gap-1.5">
                          <p className={cn("text-xs truncate leading-none", audible ? "font-medium text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]")}>{p.name}</p>
                          {p.isSpeaking && (
                             <div className="flex-shrink-0 flex gap-[1px] items-center h-2.5 w-2.5">
                                <div className="w-[1.5px] h-1.5 bg-[var(--color-success)] animate-[speakBar_0.8s_infinite]" />
                                <div className="w-[1.5px] h-2.5 bg-[var(--color-success)] animate-[speakBar_1.1s_infinite]" />
                                <div className="w-[1.5px] h-1 bg-[var(--color-success)] animate-[speakBar_0.9s_infinite]" />
                             </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[9px] text-[var(--color-text-muted)] truncate leading-none">
                          <MapPin className="w-2.5 h-2.5 flex-shrink-0 opacity-70" />
                          <span className="truncate">{pZoneName}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          ))
        }
      </div>
      {audioEnabled && (
        <div className="p-3 bg-[var(--color-bg-secondary)]/50 border-t border-[var(--color-border)] shrink-0 z-20">
          <div className="flex flex-col gap-2 bg-[var(--color-bg-card)] p-2.5 rounded-lg border border-[var(--color-border)] shadow-sm">
             <div className="flex justify-between items-center">
                <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Hearing Radius</label>
                <span className="text-[9px] font-bold text-[var(--color-accent)]">{hearingRange}px</span>
             </div>
             <input type="range" min="50" max="400" value={hearingRange} onChange={(e) => onHearingRangeChange(Number(e.target.value))} className="w-full accent-[var(--color-accent)] h-1" />
          </div>
        </div>
      )}
    </div>
  );
};

const OfficeCanvas = ({ userName, userColor, audioEnabled, audioMuted, hearingRange, micLevel, audioEngine, remotePlayers = {}, theme, onStateUpdate, myStream, peer }: { userName: string, userColor: string, audioEnabled: boolean, audioMuted: boolean, hearingRange: number, micLevel: number, audioEngine: any, remotePlayers: Record<string, RemotePlayer>, theme: 'light' | 'dark', onStateUpdate: (s: any) => void, myStream: MediaStream | null, peer: Peer | null }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const userPos = useRef<Position>({ ...SPAWN_POSITION });
  const keys = useRef<Set<string>>(new Set());
  const movePath = useRef<Position[]>([]);
  const frame = useRef(0);
  const syncTick = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const accumulatorRef = useRef(0);
  const activeCalls = useRef<Map<string, { call: any; streamAdded: boolean; timeoutId: number | null }>>(new Map());
  
  // REFS for stability in the physics/render loop
  const remotePlayersRef = useRef(remotePlayers);
  const audioEnabledRef = useRef(audioEnabled);
  const audioMutedRef = useRef(audioMuted);
  const hearingRangeRef = useRef(hearingRange);
  const micLevelRef = useRef(micLevel);
  const themeRef = useRef(theme);
  const myStreamRef = useRef(myStream);
  
  useEffect(() => { remotePlayersRef.current = remotePlayers; }, [remotePlayers]);
  useEffect(() => { audioEnabledRef.current = audioEnabled; }, [audioEnabled]);
  useEffect(() => { audioMutedRef.current = audioMuted; }, [audioMuted]);
  useEffect(() => { hearingRangeRef.current = hearingRange; }, [hearingRange]);
  useEffect(() => { micLevelRef.current = micLevel; }, [micLevel]);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { myStreamRef.current = myStream; }, [myStream]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const getPath = (start: Position, end: Position): Position[] => {
    const startNode = { x: Math.round(start.x / 12), y: Math.round(start.y / 12) };
    const endNode = { x: Math.round(end.x / 12), y: Math.round(end.y / 12) };
    const queue = [startNode];
    const visited = new Set([`${startNode.x},${startNode.y}`]);
    const parentMap = new Map<string, any>();
    let found = false, iterations = 0;
    while (queue.length > 0 && iterations < 2000) {
      iterations++;
      const current = queue.shift()!;
      if (current.x === endNode.x && current.y === endNode.y) { found = true; break; }
      const neighbors = [{ x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y }, { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 }];
      for (const next of neighbors) {
        const key = `${next.x},${next.y}`;
        const xVal = next.x * 12, yVal = next.y * 12;
        if (!visited.has(key) && isWalkable(xVal-6, yVal-6) && isWalkable(xVal+6, yVal+6)) {
          visited.add(key); parentMap.set(key, current); queue.push(next);
        }
      }
    }
    if (found) {
      const path = [end]; let curr = endNode;
      while (parentMap.has(`${curr.x},${curr.y}`)) { curr = parentMap.get(`${curr.x},${curr.y}`); path.unshift({ x: curr.x * 12, y: curr.y * 12 }); }
      return path;
    }
    return [end];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleDblClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / MAP_WIDTH, rect.height / MAP_HEIGHT);
      const renderedW = MAP_WIDTH * scale, renderedH = MAP_HEIGHT * scale;
      const offsetX = (rect.width - renderedW) / 2, offsetY = (rect.height - renderedH) / 2;
      const clickX = e.clientX - rect.left - offsetX, clickY = e.clientY - rect.top - offsetY;
      if (clickX < 0 || clickX > renderedW || clickY < 0 || clickY > renderedH) return;
      const tx = clickX / scale, ty = clickY / scale;
      let targetPos = { x: tx, y: ty };
      ZONES.forEach(z => z.seats.forEach(s => { if (distance({ x: tx, y: ty }, { x: s.cx, y: s.cy }) < 40) targetPos = { x: s.cx, y: s.cy }; }));
      if (isWalkable(targetPos.x, targetPos.y)) movePath.current = getPath(userPos.current, targetPos);
    };
    canvas.addEventListener('dblclick', handleDblClick);
    return () => canvas.removeEventListener('dblclick', handleDblClick);
  }, []);

  // Proximity and Audio logic moved out of useEffect to avoid recreation
  function manageProximityCalls() {
    if (!peer || !myStreamRef.current) return;
    const up = userPos.current, myZone = getZoneAtPosition(up);
    Object.values(remotePlayersRef.current || {}).forEach(p => {
      if (!p || !p.peerId) return;
      const d = distance(up, p.pos), otherZone = p.roomId;
      const sharingRoom = Boolean(myZone && otherZone === myZone);
      const sharingOpenFloor = !myZone && !otherZone && d < 350;
      const shouldBeConnected = sharingRoom || sharingOpenFloor;
      const isConnected = activeCalls.current.has(p.id);
      const crossedRoomBoundary =
        !sharingRoom &&
        !sharingOpenFloor &&
        isConnected &&
        Boolean(myZone || otherZone);
      
      if (shouldBeConnected && !isConnected) {
        if (peer.id > p.peerId) {
          const call = peer.call(p.peerId, myStreamRef.current!);
          if (!call) return;
          const timeoutId = window.setTimeout(() => {
            const activeCall = activeCalls.current.get(p.id);
            if (!activeCall || activeCall.streamAdded) return;
            activeCall.call.close();
            audioEngine?.removeUser(p.id);
            activeCalls.current.delete(p.id);
          }, CALL_CONNECT_TIMEOUT_MS);

          activeCalls.current.set(p.id, { call, streamAdded: false, timeoutId });
          call.on('stream', (s) => { 
            audioEngine?.addRemoteStream(p.id, s); 
            if (activeCalls.current.has(p.id)) {
              const activeCall = activeCalls.current.get(p.id)!;
              activeCall.streamAdded = true;
              if (activeCall.timeoutId != null) {
                window.clearTimeout(activeCall.timeoutId);
                activeCall.timeoutId = null;
              }
            }
          });
          call.on('close', () => {
            const activeCall = activeCalls.current.get(p.id);
            if (activeCall?.timeoutId != null) window.clearTimeout(activeCall.timeoutId);
            audioEngine?.removeUser(p.id);
            activeCalls.current.delete(p.id);
          });
          call.on('error', (e: any) => {
            const activeCall = activeCalls.current.get(p.id);
            if (activeCall?.timeoutId != null) window.clearTimeout(activeCall.timeoutId);
            console.warn('Call error', e);
            audioEngine?.removeUser(p.id);
            activeCalls.current.delete(p.id);
          });
        }
      } else if (crossedRoomBoundary || (!shouldBeConnected && isConnected && d > 450)) {
        const activeCall = activeCalls.current.get(p.id);
        if (activeCall?.timeoutId != null) window.clearTimeout(activeCall.timeoutId);
        activeCall?.call.close();
        audioEngine?.removeUser(p.id); 
        activeCalls.current.delete(p.id);
      }
    });
  }

  function tickAudio() {
    const up = userPos.current, myZone = getZoneAtPosition(up), range = hearingRangeRef.current;
    const isLocalTalking = !audioMutedRef.current && micLevelRef.current > 22;
    const duckingFactor = isLocalTalking ? LOCAL_TALK_DUCKING : 1;
    Object.values(remotePlayersRef.current || {}).forEach(p => {
      if (!p) return;
      let hear = false, vol = 0;
      if (myZone && p.roomId === myZone) { hear = true; vol = 1.0; }
      else if (!myZone && !p.roomId) {
        const d = distance(up, p.pos);
        if (d < range) { hear = true; vol = Math.max(0, 1 - Math.pow(d / range, 1.5)); }
      }
      audioEngine?.updateUser(p.id, up, p.pos, hear, vol * PLAYBACK_ATTENUATION * duckingFactor);
    });
  }

  function calcAudible(up: Position, myZone: string | null): AudibleUser[] {
    const range = hearingRangeRef.current;
    return Object.values(remotePlayersRef.current || {}).map(p => {
      const d = distance(up, p.pos);
      let vol = (myZone && p.roomId === myZone) ? 1.0 : (!myZone && !p.roomId && d < range ? Math.max(0, 1 - Math.pow(d / range, 1.5)) : 0);
      return { id: p.id, name: p.name, distance: Math.round(d), volume: vol, color: p.color, isSpeaking: p.isSpeaking && vol > 0, roomId: p.roomId, peerId: p.peerId };
    });
  }

  function render(ctx: CanvasRenderingContext2D) {
    const isLight = themeRef.current === 'light', up = userPos.current, myZoneId = getZoneAtPosition(up);
    ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    ctx.fillStyle = isLight ? '#fdf8f0' : '#111827'; ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    const grain = isLight ? '#f1e6d0' : '#1f2937', bdr = isLight ? '#e5e7eb' : '#374151';
    ctx.strokeStyle = bdr; ctx.lineWidth = 0.5;
    for (let x = 0; x < MAP_WIDTH; x += 120) {
      for (let y = 0; y < MAP_HEIGHT; y += 30) {
        const off = (Math.floor(y / 30) % 2) * 60, dx = x - off;
        ctx.strokeRect(dx, y, 120, 30);
        ctx.beginPath(); ctx.strokeStyle = grain; ctx.moveTo(dx + 10, y + 15); ctx.lineTo(dx + 110, y + 15); ctx.stroke(); ctx.strokeStyle = bdr;
      }
    }
    ZONES.forEach(z => {
      const active = myZoneId === z.id;
      ctx.fillStyle = active ? (isLight ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)') : (isLight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.03)');
      ctx.strokeStyle = active ? '#22C55E' : (isLight ? '#cbd5e1' : '#2e3a50');
      ctx.lineWidth = 2; ctx.setLineDash(active ? [] : [6, 6]);
      roundRect(ctx, z.bounds.x, z.bounds.y, z.bounds.w, z.bounds.h, 12); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = isLight ? '#475569' : 'rgba(148,163,184,0.6)'; ctx.font = 'bold 13px Inter'; ctx.textAlign = 'center';
      ctx.fillText(z.name, z.bounds.x + z.bounds.w/2, z.bounds.y + 25);
      z.tables.forEach(t => {
        ctx.fillStyle = '#D6A473'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5; roundRect(ctx, t.x, t.y, t.w, t.h, 6); ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.strokeStyle = '#B88655'; ctx.lineWidth = 1.5; ctx.stroke();
      });
      z.seats.forEach(s => {
        const sz = z.id.startsWith('conf') ? 16 : 24;
        ctx.fillStyle = isLight ? '#cbd5e1' : '#1e293b'; ctx.strokeStyle = isLight ? '#94a3b8' : '#334155';
        roundRect(ctx, s.cx - sz/2, s.cy - sz/2, sz, sz, 4); ctx.fill(); ctx.stroke();
        const bw = (s.dir==='up'||s.dir==='down') ? (sz-4) : 8, bh = (s.dir==='left'||s.dir==='right') ? (sz-4) : 8;
        ctx.fillStyle = isLight ? '#94a3b8' : '#475569'; roundRect(ctx, s.bx - bw/2, s.by - bh/2, bw, bh, 3); ctx.fill();
      });
    });
    // Use the Ref for remote players to avoid disappearing avatars
    Object.values(remotePlayersRef.current || {}).forEach(p => { if (p) drawAvatar(ctx, p.pos, p.color, p.name, p.isSpeaking, false, frame.current, isLight); });
    drawAvatar(ctx, up, userColor, userName, false, true, frame.current, isLight);
  }

  function drawAvatar(ctx: CanvasRenderingContext2D, pos: Position, color: string, name: string, isSpeaking: boolean, isPlayer: boolean, f: number, isLight: boolean) {
    if (isSpeaking) { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pos.x, pos.y, 16 + Math.sin(f*0.15)*4, 0, Math.PI*2); ctx.stroke(); }
    ctx.fillStyle = isPlayer ? (isLight ? '#0d9488' : '#14b8a6') : color;
    ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.arc(pos.x, pos.y, 10, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pos.x, pos.y, 10, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = isLight ? '#0f172a' : '#fff'; ctx.font = 'bold 11px Inter'; ctx.textAlign = 'center';
    ctx.fillText(name, pos.x, pos.y + 28);
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath(); ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h); ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r); ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let rAFId: number, intervalId: any;
    const doPhysics = () => {
      const now = performance.now();
      const dt = Math.min(now - lastTimeRef.current, 2000);
      lastTimeRef.current = now;
      accumulatorRef.current += dt;
      let ticks = Math.floor(accumulatorRef.current / 16.6);
      if (ticks > 0) {
        for (let i = 0; i < ticks; i++) {
          frame.current++;
          const k = keys.current; let { x, y } = userPos.current; let dx = 0, dy = 0;
          if (k.has('w') || k.has('arrowup')) { dy -= 5; movePath.current = []; }
          if (k.has('s') || k.has('arrowdown')) { dy += 5; movePath.current = []; }
          if (k.has('a') || k.has('arrowleft')) { dx -= 5; movePath.current = []; }
          if (k.has('d') || k.has('arrowright')) { dx += 5; movePath.current = []; }
          if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
          if (!dx && !dy && movePath.current.length > 0) {
            const target = movePath.current[0];
            const tdx = target.x - x, tdy = target.y - y, d = Math.sqrt(tdx*tdx + tdy*tdy);
            if (d <= 5) { x = target.x; y = target.y; movePath.current.shift(); } else { dx = (tdx/d)*5; dy = (tdy/d)*5; }
          }
          if (dx || dy) { if (isWalkable(x + dx, y)) x += dx; if (isWalkable(x, y + dy)) y += dy; }
          if (!isWalkable(x, y)) { x = userPos.current.x; y = userPos.current.y; movePath.current = []; }
          userPos.current = { x, y };
        }
        accumulatorRef.current -= ticks * 16.6;
        manageProximityCalls();
        tickAudio();
        syncTick.current += ticks;
        if (syncTick.current >= 10) {
          syncTick.current = 0;
          const up = userPos.current;
          onStateUpdate({ userPos: up, userRoom: getZoneAtPosition(up), audibleUsers: calcAudible(up, getZoneAtPosition(up)) });
        }
      }
    };
    const doRender = () => { render(ctx); rAFId = requestAnimationFrame(doRender); };
    intervalId = setInterval(doPhysics, 16);
    rAFId = requestAnimationFrame(doRender);
    return () => { clearInterval(intervalId); cancelAnimationFrame(rAFId); };
  }, []); // NO dependencies, use Refs for data access.

  return <canvas ref={canvasRef} width={MAP_WIDTH} height={MAP_HEIGHT} className="w-full h-full object-contain cursor-crosshair block" />;
};

/**
 * MAIN APP
 */
export default function App() {
  const [joined, setJoined] = useState(false);
  const [userName, setUserName] = useState('');
  const [userColor] = useState(getRandomColor());
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [hearingRange, setHearingRange] = useState(300);
  const [micLevel, setMicLevel] = useState(0);
  const [userPos, setUserPos] = useState<Position>({ x: 0, y: 0 });
  const [userRoom, setUserRoom] = useState<string | null>(null);
  const [remotePlayers, setRemotePlayers] = useState<Record<string, RemotePlayer>>({});
  const [audibleUsers, setAudibleUsers] = useState<AudibleUser[]>([]);
  // FIX: myStream is kept in STATE so OfficeCanvas re-renders and the incoming-call
  // handler effect re-runs whenever the stream changes (e.g. after enable/unmute).
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState('default');
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState('default');
  const [canSelectOutputDevice, setCanSelectOutputDevice] = useState(false);
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const myStreamRef = useRef<MediaStream | null>(null);
  const audioEngineRef = useRef(new SpatialAudioEngine());
  const pendingRemoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const dummyAudioCtxRef = useRef<AudioContext | null>(null);
  const speechReqRef = useRef<number>(0);
  const remotePlayersRef = useRef(remotePlayers);
  const clientInstanceIdRef = useRef(getClientInstanceId());
  const hiddenLeaveTimeoutRef = useRef<number | null>(null);
  const audioMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { remotePlayersRef.current = remotePlayers; }, [remotePlayers]);

  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    setAudioInputDevices(devices.filter(device => device.kind === 'audioinput'));
    setAudioOutputDevices(devices.filter(device => device.kind === 'audiooutput'));
  }, []);

  useEffect(() => {
    const supportsSinkSelection =
      typeof window !== 'undefined' &&
      'setSinkId' in HTMLMediaElement.prototype;

    setCanSelectOutputDevice(supportsSinkSelection);

    refreshAudioDevices().catch(() => {});
    navigator.mediaDevices.addEventListener?.('devicechange', refreshAudioDevices);

    return () => {
      navigator.mediaDevices.removeEventListener?.('devicechange', refreshAudioDevices);
    };
  }, [refreshAudioDevices]);

  useEffect(() => {
    if (!audioMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!audioMenuRef.current?.contains(event.target as Node)) {
        setAudioMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [audioMenuOpen]);

  const attachRemoteStreamByPeerId = useCallback((peerId: string, remoteStream: MediaStream) => {
    const callerId = Object.keys(remotePlayersRef.current).find(
      id => remotePlayersRef.current[id].peerId === peerId
    );

    if (callerId) {
      audioEngineRef.current.addRemoteStream(callerId, remoteStream);
      pendingRemoteStreamsRef.current.delete(peerId);
      return;
    }

    pendingRemoteStreamsRef.current.set(peerId, remoteStream);
  }, []);

  useEffect(() => {
    for (const player of Object.values(remotePlayers)) {
      if (!player.peerId) continue;
      const pendingStream = pendingRemoteStreamsRef.current.get(player.peerId);
      if (!pendingStream) continue;
      audioEngineRef.current.addRemoteStream(player.id, pendingStream);
      pendingRemoteStreamsRef.current.delete(player.peerId);
    }
  }, [remotePlayers]);

  const createSilentStream = useCallback((): MediaStream => {
    if (!dummyAudioCtxRef.current) dummyAudioCtxRef.current = new AudioContext();
    return dummyAudioCtxRef.current.createMediaStreamDestination().stream;
  }, []);

  const replaceOutgoingAudioTrack = useCallback((track: MediaStreamTrack | null) => {
    Object.values(peerRef.current?.connections || {}).forEach((conns: any) => {
      conns.forEach((c: any) => {
        c.peerConnection
          ?.getSenders()
          .find((s: any) => s.track?.kind === 'audio')
          ?.replaceTrack(track);
      });
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  const startSpeechDetection = useCallback((stream: MediaStream) => {
    if (audioCtxRef.current) audioCtxRef.current.close();
    const ctx = new AudioContext(); audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyzer = ctx.createAnalyser(); src.connect(analyzer);
    const data = new Uint8Array(analyzer.frequencyBinCount);
    const check = () => {
      analyzer.getByteFrequencyData(data);
      const vol = data.reduce((a, b) => a + b) / data.length;
      socketRef.current?.emit('speaking', vol > 20); setMicLevel(vol);
      speechReqRef.current = requestAnimationFrame(check);
    };
    cancelAnimationFrame(speechReqRef.current); check();
  }, []);

  const getMicStream = useCallback(async (): Promise<MediaStream> => {
    const preferredConstraints = buildPreferredMicConstraints();
    const requestedAudioConstraints =
      selectedInputDeviceId !== 'default'
        ? ({
            ...preferredConstraints,
            deviceId: { ideal: selectedInputDeviceId },
          } as MediaTrackConstraints)
        : preferredConstraints;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: requestedAudioConstraints });
    } catch {
      // Fallback path for browsers that reject advanced constraints.
      const fallbackConstraints =
        selectedInputDeviceId !== 'default'
          ? ({
              ...MIC_AUDIO_CONSTRAINTS,
              deviceId: { ideal: selectedInputDeviceId },
            } as MediaTrackConstraints)
          : MIC_AUDIO_CONSTRAINTS;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: fallbackConstraints,
      });
    }

    const track = stream.getAudioTracks()[0];
    if (track) await tuneMicTrack(track);
    await refreshAudioDevices().catch(() => {});

    return stream;
  }, [refreshAudioDevices, selectedInputDeviceId]);

  const registerPeerCallHandlers = useCallback((peer: Peer) => {
    const handleCall = (call: any) => {
      const stream = myStreamRef.current;
      if (stream) call.answer(stream);
      else call.answer(createSilentStream());

      call.on('stream', (remoteStream: MediaStream) => {
        attachRemoteStreamByPeerId(call.peer, remoteStream);
      });
    };

    peer.on('call', handleCall);
    return () => { peer.off('call', handleCall); };
  }, [attachRemoteStreamByPeerId, createSilentStream]);

  const ensureAudioDeviceAccess = useCallback(async () => {
    await refreshAudioDevices().catch(() => {});

    const hasHiddenLabels = [...audioInputDevices, ...audioOutputDevices].some(device => !device.label);
    if (!hasHiddenLabels || !navigator.mediaDevices?.getUserMedia) return;

    let probeStream: MediaStream | null = null;
    try {
      probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return;
    } finally {
      await refreshAudioDevices().catch(() => {});
      probeStream?.getTracks().forEach(track => track.stop());
    }
  }, [audioInputDevices, audioOutputDevices, refreshAudioDevices]);

  const handleJoin = useCallback(async (name: string) => {
    setUserName(name); const spawn = getRandomSpawn(); setUserPos(spawn);
    if (!myStreamRef.current) {
      const silentStream = createSilentStream();
      myStreamRef.current = silentStream;
      setMyStream(silentStream);
    }
    const iceServers = await resolveIceServers();
    const peer = new Peer(buildPeerOptions(iceServers)); peerRef.current = peer;
    registerPeerCallHandlers(peer);
    peer.on('open', (id) => {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname.match(/\d+\.\d+\.\d+\.\d+/);
      const socket = io(isLocal ? `http://${window.location.hostname}:3001` : '/');
      socketRef.current = socket;
      socket.emit('join', {
        name,
        pos: spawn,
        roomId: null,
        peerId: id,
        color: userColor,
        audioEnabled: false,
        clientInstanceId: clientInstanceIdRef.current,
      });
      socket.on('current-players', (players) => { const others = { ...players }; if (socket.id) delete others[socket.id]; setRemotePlayers(others); });
      socket.on('player-joined', p => setRemotePlayers(prev => ({ ...prev, [p.id]: p })));
      socket.on('player-moved', ({ id, pos, roomId }) => setRemotePlayers(prev => prev[id] ? { ...prev, [id]: { ...prev[id], pos, roomId } } : prev));
      socket.on('player-speaking', ({ id, isSpeaking }) => setRemotePlayers(prev => prev[id] ? { ...prev, [id]: { ...prev[id], isSpeaking } } : prev));
      socket.on('player-audio-changed', ({ id, audioEnabled }) => setRemotePlayers(prev => prev[id] ? { ...prev, [id]: { ...prev[id], audioEnabled } } : prev));
      socket.on('player-left', id => { setRemotePlayers(prev => { const n = { ...prev }; delete n[id]; return n; }); audioEngineRef.current.removeUser(id); });
      
      // Initialize audio engine as soon as we join, so we are ready to handle incoming calls
      audioEngineRef.current.init().catch(console.error);

      // Keep a silent outbound audio track by default. This allows proximity calls
      // to establish even before the user enables their microphone.
      if (!myStreamRef.current) {
        const silentStream = createSilentStream();
        myStreamRef.current = silentStream;
        setMyStream(silentStream);
      }
      
      setJoined(true);
    });
    peer.on('error', (error) => {
      console.error('PeerJS connection error', error);
    });
  }, [createSilentStream, registerPeerCallHandlers, resolveIceServers, userColor]);

  useEffect(() => {
    if (!joined) return;

    const sendLeave = () => {
      const socket = socketRef.current;
      if (!socket) return;

      socket.emit('leave');
      socket.disconnect();
    };

    const heartbeatId = window.setInterval(() => {
      socketRef.current?.emit('presence-ping');
    }, 5000);

    const clearHiddenLeaveTimeout = () => {
      if (hiddenLeaveTimeoutRef.current == null) return;
      window.clearTimeout(hiddenLeaveTimeoutRef.current);
      hiddenLeaveTimeoutRef.current = null;
    };

    const scheduleHiddenLeave = () => {
      clearHiddenLeaveTimeout();
      hiddenLeaveTimeoutRef.current = window.setTimeout(() => {
        if (document.visibilityState === 'hidden') sendLeave();
      }, 8000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') scheduleHiddenLeave();
      else clearHiddenLeaveTimeout();
    };

    const handlePageHide = () => sendLeave();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      window.clearInterval(heartbeatId);
      clearHiddenLeaveTimeout();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, [joined]);

  const handleEnableAudio = useCallback(async () => {
    try {
      const stream = await getMicStream();
      myStreamRef.current = stream;
      setMyStream(stream); // update state so OfficeCanvas re-renders with live stream
      replaceOutgoingAudioTrack(stream.getAudioTracks()[0] || null);
      await audioEngineRef.current.init();
      setAudioEnabled(true); setAudioMuted(false); startSpeechDetection(stream);
      socketRef.current?.emit('audio-enabled', true);
    } catch (err) { alert("Microphone access required."); }
  }, [getMicStream, replaceOutgoingAudioTrack, startSpeechDetection]);

  const handleToggleMute = useCallback(async () => {
    await audioEngineRef.current.resume();

    if (!audioMuted) {
      // Mute: replace mic track with a silent dummy track so peers receive silence
      if (myStreamRef.current) myStreamRef.current.getTracks().forEach(t => t.stop());
      const silentStream = createSilentStream();
      myStreamRef.current = silentStream;
      setMyStream(silentStream);
      const track = silentStream.getAudioTracks()[0];
      replaceOutgoingAudioTrack(track || null);
      cancelAnimationFrame(speechReqRef.current); audioCtxRef.current?.close(); setMicLevel(0); setAudioMuted(true);
    } else {
      try {
        const stream = await getMicStream();
        myStreamRef.current = stream;
        setMyStream(stream);
        const track = stream.getAudioTracks()[0];
        replaceOutgoingAudioTrack(track || null);
        startSpeechDetection(stream); setAudioMuted(false);
      } catch (err) { alert("Microphone access required."); }
    }
  }, [audioMuted, createSilentStream, getMicStream, replaceOutgoingAudioTrack, startSpeechDetection]);

  const handleOutputDeviceChange = useCallback(async (deviceId: string) => {
    setSelectedOutputDeviceId(deviceId);
    try {
      await audioEngineRef.current.setOutputDevice(deviceId);
    } catch (error) {
      console.warn('Failed to switch speaker output', error);
    }
  }, []);

  const handleInputDeviceChange = useCallback(async (deviceId: string) => {
    setSelectedInputDeviceId(deviceId);

    if (!audioEnabled || audioMuted) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio:
          deviceId === 'default'
            ? buildPreferredMicConstraints()
            : ({
                ...buildPreferredMicConstraints(),
                deviceId: { ideal: deviceId },
              } as MediaTrackConstraints),
      }).catch(async () => {
        return navigator.mediaDevices.getUserMedia({
          audio:
            deviceId === 'default'
              ? MIC_AUDIO_CONSTRAINTS
              : ({
                  ...MIC_AUDIO_CONSTRAINTS,
                  deviceId: { ideal: deviceId },
                } as MediaTrackConstraints),
        });
      });

      const track = stream.getAudioTracks()[0];
      if (track) await tuneMicTrack(track);
      myStreamRef.current?.getTracks().forEach((t) => t.stop());
      myStreamRef.current = stream;
      setMyStream(stream);
      replaceOutgoingAudioTrack(track || null);
      startSpeechDetection(stream);
      await refreshAudioDevices().catch(() => {});
    } catch (error) {
      console.warn('Failed to switch microphone input', error);
    }
  }, [audioEnabled, audioMuted, refreshAudioDevices, replaceOutgoingAudioTrack, startSpeechDetection]);

  const handleToggleAudioMenu = useCallback(() => {
    setAudioMenuOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) ensureAudioDeviceAccess().catch(() => {});
      return nextOpen;
    });
  }, [ensureAudioDeviceAccess]);

  const handleLeave = () => { window.location.reload(); };
  const handleStateUpdate = useCallback((s: any) => { setUserPos(s.userPos); setUserRoom(s.userRoom); setAudibleUsers(s.audibleUsers); socketRef.current?.emit('move', { pos: s.userPos, roomId: s.userRoom }); }, []);

  if (!joined) return <JoinScreen onJoin={handleJoin} />;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] font-sans">
      <div className="w-64 md:w-72 shrink-0 flex flex-col z-40 bg-[var(--color-bg-card)] border-r border-[var(--color-border)] relative shadow-lg h-full">
         <Sidebar userName={userName} userRoom={userRoom} allPlayers={Object.values(remotePlayers)} audibleUsers={audibleUsers} audioEnabled={audioEnabled} onHearingRangeChange={setHearingRange} hearingRange={hearingRange} />
      </div>
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
         <header className="h-16 flex items-center justify-between px-4 lg:px-6 bg-[var(--color-bg-card)]/80 backdrop-blur-md border-b border-[var(--color-border)] z-30 shrink-0">
            <div className="flex items-center gap-3 select-none">
               <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-blue)] flex items-center justify-center shadow-md"><span className="text-white font-bold text-sm">P</span></div>
               <h1 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] hidden sm:block">Paracosma Virtual Office</h1>
            </div>
            <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="p-2.5 rounded-xl bg-transparent hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all border border-transparent hover:border-[var(--color-border-light)]">
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
         </header>
         <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4 sm:p-8 bg-[var(--color-bg-secondary)]">
            <div className="relative w-full max-w-[1400px] h-full max-h-[850px] flex items-center justify-center bg-[var(--color-bg-card)] rounded-2xl shadow-xl border border-[var(--color-border)] overflow-hidden">
               <OfficeCanvas userName={userName} userColor={userColor} audioEnabled={audioEnabled} audioMuted={audioMuted} hearingRange={hearingRange} micLevel={micLevel} audioEngine={audioEngineRef.current} remotePlayers={remotePlayers} theme={theme} onStateUpdate={handleStateUpdate} myStream={myStream} peer={peerRef.current} />
            </div>
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center p-1.5 bg-[var(--color-bg-card)]/90 backdrop-blur-xl rounded-full border border-[var(--color-border)] shadow-2xl z-30">
              <div ref={audioMenuRef} className="relative flex items-center">
                {audioMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-3 w-80 rounded-3xl border border-[var(--color-border)] bg-[#1b1f23]/96 p-3 text-left shadow-2xl backdrop-blur-xl">
                    <div className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Select Microphone</div>
                    <button
                      onClick={() => { handleInputDeviceChange('default'); }}
                      className="flex w-full items-start gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-white/5"
                    >
                      <div className="mt-1 h-4 w-4 shrink-0 text-[var(--color-accent)]">{selectedInputDeviceId === 'default' ? <Check className="h-4 w-4" /> : null}</div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white">System Default</div>
                        <div className="truncate text-xs text-[var(--color-text-muted)]">Default microphone</div>
                      </div>
                    </button>
                    {audioInputDevices.map((device) => (
                      <button
                        key={device.deviceId}
                        onClick={() => { handleInputDeviceChange(device.deviceId); }}
                        className="flex w-full items-start gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-white/5"
                      >
                        <div className="mt-1 h-4 w-4 shrink-0 text-[var(--color-accent)]">{selectedInputDeviceId === device.deviceId ? <Check className="h-4 w-4" /> : null}</div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-white">{getDeviceLabel(device, 'Microphone')}</div>
                        </div>
                      </button>
                    ))}

                    <div className="my-2 h-px bg-white/8" />
                    <div className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Select Speaker</div>
                    <button
                      onClick={() => { handleOutputDeviceChange('default'); }}
                      className="flex w-full items-start gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-white/5"
                    >
                      <div className="mt-1 h-4 w-4 shrink-0 text-[var(--color-accent)]">{selectedOutputDeviceId === 'default' ? <Check className="h-4 w-4" /> : null}</div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white">System Default</div>
                        <div className="truncate text-xs text-[var(--color-text-muted)]">Default speaker</div>
                      </div>
                    </button>
                    {canSelectOutputDevice ? (
                      audioOutputDevices.map((device) => (
                        <button
                          key={device.deviceId}
                          onClick={() => { handleOutputDeviceChange(device.deviceId); }}
                          className="flex w-full items-start gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-white/5"
                        >
                          <div className="mt-1 h-4 w-4 shrink-0 text-[var(--color-accent)]">{selectedOutputDeviceId === device.deviceId ? <Check className="h-4 w-4" /> : null}</div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white">{getDeviceLabel(device, 'Speaker')}</div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-[var(--color-text-muted)]">This browser does not support selecting a speaker output device.</div>
                    )}
                  </div>
                )}
                <button onClick={!audioEnabled ? handleEnableAudio : handleToggleMute} className={cn("w-12 h-12 flex shrink-0 items-center justify-center rounded-full transition-all duration-300", !audioEnabled ? "bg-[var(--color-accent)] text-white animate-pulse" : audioMuted ? "bg-red-500 text-white" : "bg-[var(--color-bg-secondary)] hover:bg-[var(--color-border)]")}>
                  {(!audioEnabled || audioMuted) ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                  onClick={handleToggleAudioMenu}
                  className="ml-1 flex h-12 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] transition hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)]"
                  title="Audio devices"
                >
                  <ChevronUp className={cn("h-4 w-4 transition-transform", audioMenuOpen ? "rotate-180" : "")} />
                </button>
              </div>
              {audioEnabled && (
                <div className="flex items-center justify-center w-8 ml-1 mr-1">
                  <div className="flex items-end gap-[3px] h-5">
                    <div className="w-1 bg-[var(--color-success)] rounded-full transition-all duration-75" style={{ height: audioMuted ? '4px' : `${Math.max(4, Math.min(20, micLevel * 0.3))}px`, opacity: audioMuted ? 0.3 : 1 }} />
                    <div className="w-1 bg-[var(--color-success)] rounded-full transition-all duration-75" style={{ height: audioMuted ? '4px' : `${Math.max(4, Math.min(20, micLevel * 0.5))}px`, opacity: audioMuted ? 0.3 : 1 }} />
                    <div className="w-1 bg-[var(--color-success)] rounded-full transition-all duration-75" style={{ height: audioMuted ? '4px' : `${Math.max(4, Math.min(20, micLevel * 0.4))}px`, opacity: audioMuted ? 0.3 : 1 }} />
                  </div>
                </div>
              )}
              <div className="w-px h-6 bg-[var(--color-border)] mx-2" />
              <button onClick={handleLeave} className="w-12 h-12 flex shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300"><LogOut className="w-5 h-5 ml-1" /></button>
            </div>
         </div>
      </div>
    </div>
  );
}

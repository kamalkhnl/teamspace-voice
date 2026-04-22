import React, { useRef, useEffect } from 'react';
import Peer from 'peerjs';

// --- TYPES (Consolidated from src/types.ts) ---
export interface Position {
  x: number;
  y: number;
}

export interface RemotePlayer {
  id: string;
  name: string;
  pos: Position;
  roomId: string | null;
  peerId: string;
  color: string;
  isSpeaking: boolean;
}

export interface AudibleUser {
  id: string;
  name: string;
  distance: number;
  volume: number;
  color: string;
  isSpeaking: boolean;
  roomId: string | null;
  peerId?: string;
}

// --- LAYOUT DATA & LOGIC (Consolidated from src/data/officeLayout.ts) ---
export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 800;
export const SPAWN_POSITION = { x: 485, y: 460 };

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

export const ZONES = [
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
  {
    id: 'art-mgr', name: 'Art Manager',
    bounds: { x: 40, y: 480, w: 130, h: 180 },
    tables: [{ x: 80, y: 530, w: 70, h: 100 }],
    seats: [...generateSeats(1, 0, 580, 0, 'right', { x: 80, y: 530, w: 70, h: 100 })]
  },
  {
    id: 'proj-mgr', name: 'Project Manager',
    bounds: { x: 190, y: 480, w: 130, h: 180 },
    tables: [{ x: 230, y: 530, w: 70, h: 100 }],
    seats: [...generateSeats(1, 0, 580, 0, 'right', { x: 230, y: 530, w: 70, h: 100 })]
  },
  {
    id: 'conf-a', name: 'Meeting Room A',
    bounds: { x: 340, y: 480, w: 140, h: 180 },
    tables: [{ x: 380, y: 530, w: 60, h: 110 }],
    seats: [
      ...generateSeats(5, 0, 540, 22, 'right', { x: 380, y: 530, w: 60, h: 110 }),
      ...generateSeats(5, 0, 540, 22, 'left', { x: 380, y: 530, w: 60, h: 110 })
    ]
  },
  {
    id: 'game-web', name: 'Game & Marketing',
    bounds: { x: 500, y: 80, w: 180, h: 370 },
    tables: [{ x: 550, y: 150, w: 80, h: 240 }],
    seats: [
      ...generateSeats(3, 0, 180, 70, 'right', { x: 550, y: 150, w: 80, h: 240 }),
      ...generateSeats(3, 0, 180, 70, 'left', { x: 550, y: 150, w: 80, h: 240 })
    ]
  },
  {
    id: 'hr', name: 'Human Resources',
    bounds: { x: 710, y: 80, w: 120, h: 170 },
    tables: [{ x: 730, y: 150, w: 80, h: 80 }],
    seats: [...generateSeats(1, 770, 0, 0, 'down', { x: 730, y: 150, w: 80, h: 80 })]
  },
  {
    id: 'account', name: 'Accounting',
    bounds: { x: 850, y: 80, w: 120, h: 170 },
    tables: [{ x: 870, y: 150, w: 80, h: 80 }],
    seats: [...generateSeats(1, 910, 0, 0, 'down', { x: 870, y: 150, w: 80, h: 80 })]
  },
  {
    id: 'it', name: 'IT Department',
    bounds: { x: 710, y: 280, w: 120, h: 170 },
    tables: [{ x: 730, y: 350, w: 80, h: 80 }],
    seats: [...generateSeats(1, 770, 0, 0, 'down', { x: 730, y: 350, w: 80, h: 80 })]
  },
  {
    id: 'facility', name: 'Facilities',
    bounds: { x: 850, y: 280, w: 120, h: 170 },
    tables: [{ x: 870, y: 350, w: 80, h: 80 }],
    seats: [...generateSeats(1, 910, 0, 0, 'down', { x: 870, y: 350, w: 80, h: 80 })]
  },
  {
    id: 'ai', name: 'Simulation & AI',
    bounds: { x: 500, y: 480, w: 180, h: 180 },
    tables: [{ x: 550, y: 540, w: 80, h: 80 }],
    seats: [
      ...generateSeats(1, 0, 580, 80, 'right', { x: 550, y: 540, w: 80, h: 80 }),
      ...generateSeats(1, 0, 580, 80, 'left', { x: 550, y: 540, w: 80, h: 80 })
    ]
  },
  {
    id: 'conf-b', name: 'Meeting Room B',
    bounds: { x: 710, y: 480, w: 260, h: 180 },
    tables: [{ x: 750, y: 550, w: 180, h: 60 }],
    seats: [
      ...generateSeats(4, 765, 0, 45, 'down', { x: 750, y: 550, w: 180, h: 60 }),
      ...generateSeats(4, 765, 0, 45, 'up', { x: 750, y: 550, w: 180, h: 60 })
    ]
  }
];

export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || x > MAP_WIDTH || y < 0 || y > MAP_HEIGHT) return false;
  for (const zone of ZONES) {
    for (const table of zone.tables) {
      if (x >= table.x && x <= table.x + table.w && y >= table.y && y <= table.y + table.h) return false;
    }
  }
  return true;
}

export function getZoneAtPosition(pos: Position): string | null {
  const zone = ZONES.find(z => 
    pos.x >= z.bounds.x && pos.x <= z.bounds.x + z.bounds.w && 
    pos.y >= z.bounds.y && pos.y <= z.bounds.y + z.bounds.h
  );
  return zone?.id || null;
}

export function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// --- COMPONENT LOGIC ---
const AVATAR_R = 10;
const SPEED = 5;
const GRID_SIZE = 12; 

interface Props {
  userName: string;
  userColor: string;
  audioEnabled: boolean;
  audioMuted: boolean;
  hearingRange: number;
  audioEngine: any;
  remotePlayers: Record<string, RemotePlayer>;
  myStream: MediaStream | null;
  peer: Peer | null;
  theme: 'light' | 'dark';
  onStateUpdate: (s: {
    userPos: Position;
    userRoom: string | null;
    audibleUsers: AudibleUser[];
  }) => void;
}

export default function OfficeCanvas({
  userName,
  userColor,
  audioEnabled,
  audioMuted,
  hearingRange,
  audioEngine,
  remotePlayers = {}, // Defaulting to empty object to prevent TypeError
  myStream,
  peer,
  theme,
  onStateUpdate,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const userPos = useRef<Position>({ ...SPAWN_POSITION });
  const keys = useRef<Set<string>>(new Set());
  const movePath = useRef<Position[]>([]);
  const frame = useRef(0);
  const syncTick = useRef(0);
  
  const lastTimeRef = useRef(performance.now());
  const accumulatorRef = useRef(0);
  
  const activeCalls = useRef<Map<string, { call: any; streamAdded: boolean }>>(new Map());
  const hearingRangeRef = useRef(hearingRange);

  useEffect(() => {
    hearingRangeRef.current = hearingRange;
  }, [hearingRange]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  function canMoveTo(x: number, y: number, radius = 6): boolean {
    return isWalkable(x - radius, y - radius) && isWalkable(x + radius, y - radius) && 
           isWalkable(x - radius, y + radius) && isWalkable(x + radius, y + radius);
  }

  function getPath(start: Position, end: Position): Position[] {
    const startNode = { x: Math.round(start.x / GRID_SIZE), y: Math.round(start.y / GRID_SIZE) };
    const endNode = { x: Math.round(end.x / GRID_SIZE), y: Math.round(end.y / GRID_SIZE) };
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
        if (!visited.has(key) && canMoveTo(next.x * GRID_SIZE, next.y * GRID_SIZE)) {
          visited.add(key); parentMap.set(key, current); queue.push(next);
        }
      }
    }
    
    if (found) {
      const path = [end];
      let curr = endNode;
      while (parentMap.has(`${curr.x},${curr.y}`)) { 
        curr = parentMap.get(`${curr.x},${curr.y}`); 
        path.unshift({ x: curr.x * GRID_SIZE, y: curr.y * GRID_SIZE }); 
      }
      return path;
    }
    return [end];
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleDblClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / MAP_WIDTH;
      const scaleY = rect.height / MAP_HEIGHT;
      const scale = Math.min(scaleX, scaleY);
      const renderedW = MAP_WIDTH * scale;
      const renderedH = MAP_HEIGHT * scale;
      const offsetX = (rect.width - renderedW) / 2;
      const offsetY = (rect.height - renderedH) / 2;
      const clickX = e.clientX - rect.left - offsetX;
      const clickY = e.clientY - rect.top - offsetY;
      if (clickX < 0 || clickX > renderedW || clickY < 0 || clickY > renderedH) return;
      const tx = clickX / scale;
      const ty = clickY / scale;
      let targetPos = { x: tx, y: ty };
      ZONES.forEach(z => z.seats.forEach(s => { 
        if (distance({ x: tx, y: ty }, { x: s.cx, y: s.cy }) < 40) {
          targetPos = { x: s.cx, y: s.cy }; 
        } 
      }));
      if (isWalkable(targetPos.x, targetPos.y)) {
        movePath.current = getPath(userPos.current, targetPos);
      }
    };
    canvas.addEventListener('dblclick', handleDblClick);
    return () => canvas.removeEventListener('dblclick', handleDblClick);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let rAFId: number;
    let intervalId: any;
    if (performance.now() - lastTimeRef.current > 5000) {
       lastTimeRef.current = performance.now();
       accumulatorRef.current = 0;
    }
    const doPhysics = () => {
      const now = performance.now();
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;
      accumulatorRef.current += Math.min(dt, 2000);
      const targetFrameTime = 1000 / 60;
      let ticks = Math.floor(accumulatorRef.current / targetFrameTime);
      if (ticks > 0) {
        for (let i = 0; i < ticks; i++) { update(); }
        accumulatorRef.current -= ticks * targetFrameTime;
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
    const doRender = () => {
      render(ctx); 
      rAFId = requestAnimationFrame(doRender); 
    };
    intervalId = setInterval(doPhysics, 16);
    rAFId = requestAnimationFrame(doRender);
    return () => {
      clearInterval(intervalId);
      cancelAnimationFrame(rAFId);
    };
  }, [audioEnabled, audioMuted, theme, remotePlayers]);

  function update() {
    frame.current++;
    const k = keys.current;
    let { x, y } = userPos.current;
    let dx = 0, dy = 0;
    if (k.has('w') || k.has('arrowup')) { dy -= SPEED; movePath.current = []; }
    if (k.has('s') || k.has('arrowdown')) { dy += SPEED; movePath.current = []; }
    if (k.has('a') || k.has('arrowleft')) { dx -= SPEED; movePath.current = []; }
    if (k.has('d') || k.has('arrowright')) { dx += SPEED; movePath.current = []; }
    if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
    if (dx === 0 && dy === 0 && movePath.current.length > 0) {
      const target = movePath.current[0];
      const tdx = target.x - x;
      const tdy = target.y - y;
      const d = Math.sqrt(tdx*tdx + tdy*tdy);
      if (d <= SPEED) {
        x = target.x; y = target.y; movePath.current.shift();
      } else {
        dx = (tdx/d)*SPEED; dy = (tdy/d)*SPEED;
      }
    }
    if (dx !== 0 || dy !== 0) {
       if (canMoveTo(x + dx, y)) x += dx;
       if (canMoveTo(x, y + dy)) y += dy;
    }
    if (!isWalkable(x, y)) { x = userPos.current.x; y = userPos.current.y; movePath.current = []; }
    userPos.current = { x, y };
  }

  function manageProximityCalls() {
    if (!peer || !myStream || !audioEnabled) return;
    const up = userPos.current, myZone = getZoneAtPosition(up);
    const players = remotePlayers || {};
    Object.values(players).forEach(p => {
      if (!p) return;
      const d = distance(up, p.pos), otherZone = p.roomId;
      let shouldBeConnected = (myZone && otherZone === myZone) || (!myZone && !otherZone && d < 350);
      const isConnected = activeCalls.current.has(p.id);
      if (shouldBeConnected && !isConnected) {
        const call = peer.call(p.peerId, myStream);
        activeCalls.current.set(p.id, { call, streamAdded: false });
        call.on('stream', (s) => { audioEngine?.addRemoteStream(p.id, s); activeCalls.current.get(p.id)!.streamAdded = true; });
      } else if (!shouldBeConnected && isConnected && d > 450) {
        activeCalls.current.get(p.id)?.call.close();
        audioEngine?.removeUser(p.id); activeCalls.current.delete(p.id);
      }
    });
  }

  function tickAudio() {
    if (!audioEnabled) return;
    const up = userPos.current, myZone = getZoneAtPosition(up), range = hearingRangeRef.current;
    const players = remotePlayers || {};
    Object.values(players).forEach(p => {
      if (!p) return;
      let hear = false, vol = 0;
      if (!audioMuted) {
        const otherZone = p.roomId;
        if (myZone && otherZone === myZone) { hear = true; vol = 1.0; } 
        else if (!myZone && !otherZone) {
          const d = distance(up, p.pos);
          if (d < range) { hear = true; vol = Math.max(0, 1 - Math.pow(d / range, 1.5)); }
        }
      }
      audioEngine?.updateUser(p.id, up, p.pos, hear && p.isSpeaking, vol);
    });
  }

  function calcAudible(up: Position, myZone: string | null): AudibleUser[] {
    const range = hearingRangeRef.current;
    const players = remotePlayers || {};
    return Object.values(players).map(p => {
      const d = distance(up, p.pos), otherZone = p.roomId;
      let vol = (myZone && otherZone === myZone) ? 1.0 : (!myZone && !otherZone && d < range ? Math.max(0, 1 - Math.pow(d / range, 1.5)) : 0);
      return { id: p.id, name: p.name, distance: Math.round(d), volume: vol, color: p.color, isSpeaking: p.isSpeaking && vol > 0, roomId: otherZone, peerId: p.peerId };
    });
  }

  function render(ctx: CanvasRenderingContext2D) {
    const isLight = theme === 'light';
    const up = userPos.current;
    const myZoneId = getZoneAtPosition(up);

    ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    drawWoodParquet(ctx, isLight);

    ZONES.forEach(z => {
      const active = myZoneId === z.id;
      ctx.fillStyle = active ? (isLight ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)') : (isLight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.03)');
      ctx.strokeStyle = active ? '#22C55E' : (isLight ? '#cbd5e1' : '#2e3a50');
      ctx.lineWidth = 2; ctx.setLineDash(active ? [] : [6, 6]);
      roundRect(ctx, z.bounds.x, z.bounds.y, z.bounds.w, z.bounds.h, 12);
      ctx.fill(); ctx.stroke(); ctx.setLineDash([]);

      ctx.fillStyle = isLight ? '#475569' : 'rgba(148,163,184,0.6)';
      ctx.font = 'bold 13px Inter'; ctx.textAlign = 'center';
      ctx.fillText(z.name, z.bounds.x + z.bounds.w/2, z.bounds.y + 25);

      z.tables.forEach(t => {
        ctx.fillStyle = '#D6A473'; ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
        roundRect(ctx, t.x, t.y, t.w, t.h, 6); ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.strokeStyle = '#B88655'; ctx.lineWidth = 1.5; ctx.stroke();
      });

      z.seats.forEach(s => {
        const isMeeting = z.id.startsWith('conf');
        const size = isMeeting ? 16 : 24;
        ctx.fillStyle = isLight ? '#cbd5e1' : '#1e293b'; ctx.strokeStyle = isLight ? '#94a3b8' : '#334155';
        roundRect(ctx, s.cx - size/2, s.cy - size/2, size, size, 4); ctx.fill(); ctx.stroke();
        const bw = s.dir==='up'||s.dir==='down' ? (isMeeting?12:20) : 8;
        const bh = s.dir==='left'||s.dir==='right' ? (isMeeting?12:20) : 8;
        ctx.fillStyle = isLight ? '#94a3b8' : '#475569';
        roundRect(ctx, s.bx - bw/2, s.by - bh/2, bw, bh, 3); ctx.fill();
        if (!isMeeting) {
          const mw = s.dir==='up'||s.dir==='down'?24:8;
          const mh = s.dir==='left'||s.dir==='right'?24:8;
          ctx.fillStyle = '#334155'; roundRect(ctx, s.mx - mw/2, s.my - mh/2, mw, mh, 2); ctx.fill();
        }
      });
    });

    if (!myZoneId && audioEnabled && !audioMuted) {
      ctx.fillStyle = 'rgba(20, 184, 166, 0.05)'; ctx.strokeStyle = 'rgba(20, 184, 166, 0.3)';
      ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(up.x, up.y, hearingRangeRef.current, 0, Math.PI*2);
      ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    }

    const players = remotePlayers || {};
    Object.values(players).forEach(p => {
        if (p) drawAvatar(ctx, p.pos, p.color, p.name, p.isSpeaking, false, frame.current, isLight);
    });
    drawAvatar(ctx, up, userColor, userName, false, true, frame.current, isLight);
  }

  function drawWoodParquet(ctx: CanvasRenderingContext2D, isLight: boolean) {
    const baseColor = isLight ? '#fdf8f0' : '#111827';
    const grainColor = isLight ? '#f1e6d0' : '#1f2937';
    const borderColor = isLight ? '#e5e7eb' : '#374151';
    
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    
    const plankW = 120;
    const plankH = 30;
    
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    
    for (let x = 0; x < MAP_WIDTH; x += plankW) {
      for (let y = 0; y < MAP_HEIGHT; y += plankH) {
        const offsetX = (Math.floor(y / plankH) % 2) * (plankW / 2);
        const drawX = x - offsetX;
        ctx.strokeRect(drawX, y, plankW, plankH);
        ctx.beginPath();
        ctx.strokeStyle = grainColor;
        ctx.moveTo(drawX + 10, y + plankH / 2);
        ctx.lineTo(drawX + plankW - 10, y + plankH / 2);
        ctx.stroke();
        ctx.strokeStyle = borderColor;
      }
    }
  }

  function drawAvatar(ctx: CanvasRenderingContext2D, pos: Position, color: string, name: string, isSpeaking: boolean, isPlayer: boolean, f: number, isLight: boolean) {
    if (isSpeaking) {
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, AVATAR_R + 6 + Math.sin(f*0.15)*4, 0, Math.PI*2); ctx.stroke();
    }
    ctx.fillStyle = isPlayer ? (isLight ? '#0d9488' : '#14b8a6') : color;
    ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.arc(pos.x, pos.y, AVATAR_R, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, AVATAR_R, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = isLight ? '#0f172a' : '#fff'; ctx.font = 'bold 11px Inter'; ctx.textAlign = 'center';
    ctx.fillText(name, pos.x, pos.y + AVATAR_R + 18);
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath(); ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h); ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r); ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
  }

  return (
    <canvas ref={canvasRef} width={MAP_WIDTH} height={MAP_HEIGHT} className="w-full h-full object-contain"
      style={{ display: 'block', cursor: 'crosshair' }} />
  );
}
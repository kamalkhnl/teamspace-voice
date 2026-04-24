import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import crypto from 'crypto';
import { Server } from 'socket.io';
import { ExpressPeerServer } from 'peer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});
const peerServer = ExpressPeerServer(httpServer, {
  path: '/',
  proxied: true,
});

app.use('/peerjs', peerServer);

const DEFAULT_ICE_SERVERS = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ],
  },
];
const PLAYER_STALE_MS = 15000;

function parseIceServersFromEnv() {
  const raw = process.env.VITE_PEER_ICE_SERVERS?.trim();
  if (!raw) return DEFAULT_ICE_SERVERS;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}

function buildTurnIceServers() {
  const turnSecret = process.env.TURN_SHARED_SECRET?.trim();
  const turnUrlsRaw = process.env.TURN_URLS?.trim();

  if (!turnSecret || !turnUrlsRaw) return parseIceServersFromEnv();

  const ttl = Math.max(60, Number.parseInt(process.env.TURN_TTL_SECONDS || '86400', 10) || 86400);
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;
  const username = `${expiresAt}:voice-user`;
  const credential = crypto
    .createHmac('sha1', turnSecret)
    .update(username)
    .digest('base64');

  const turnUrls = turnUrlsRaw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (turnUrls.length === 0) return parseIceServersFromEnv();

  return [
    ...DEFAULT_ICE_SERVERS,
    {
      urls: turnUrls,
      username,
      credential,
    },
  ];
}

app.get('/api/ice-servers', (_req, res) => {
  res.json({
    iceServers: buildTurnIceServers(),
  });
});

// Store all active players
const players = {};

function markPlayerAlive(socketId) {
  if (!players[socketId]) return;
  players[socketId].lastSeenAt = Date.now();
}

function removePlayer(socketId) {
  const hadPlayer = Boolean(players[socketId]);
  delete players[socketId];
  if (hadPlayer) io.emit('player-left', socketId);
}

io.on('connection', (socket) =>
{
  console.log(`User connected: ${socket.id}`);

  socket.on('join', ({ name, pos, roomId, peerId, color, audioEnabled, clientInstanceId }) =>
  {
    if (clientInstanceId) {
      Object.entries(players).forEach(([existingSocketId, player]) => {
        if (existingSocketId === socket.id) return;
        if (player.clientInstanceId !== clientInstanceId) return;

        removePlayer(existingSocketId);
        io.sockets.sockets.get(existingSocketId)?.disconnect(true);
      });
    }

    // Register new player
    players[socket.id] = {
      id: socket.id,
      name,
      pos,
      roomId,
      peerId,
      clientInstanceId,
      color,
      isSpeaking: false,
      audioEnabled: audioEnabled || false,
      lastSeenAt: Date.now(),
    };

    // Broadcast to others
    socket.broadcast.emit('player-joined', players[socket.id]);

    // Send current players to the new guy
    socket.emit('current-players', players);
  });

  socket.on('move', (data) =>
  {
    if (players[socket.id])
    {
      markPlayerAlive(socket.id);
      players[socket.id].pos = data.pos;
      players[socket.id].roomId = data.roomId;
      socket.broadcast.emit('player-moved', {
        id: socket.id,
        pos: data.pos,
        roomId: data.roomId
      });
    }
  });

  socket.on('speaking', (isSpeaking) =>
  {
    if (players[socket.id])
    {
      markPlayerAlive(socket.id);
      players[socket.id].isSpeaking = isSpeaking;
      socket.broadcast.emit('player-speaking', {
        id: socket.id,
        isSpeaking
      });
    }
  });

  socket.on('audio-enabled', (audioEnabled) =>
  {
    if (players[socket.id])
    {
      markPlayerAlive(socket.id);
      players[socket.id].audioEnabled = audioEnabled;
      socket.broadcast.emit('player-audio-changed', {
        id: socket.id,
        audioEnabled
      });
    }
  });

  socket.on('presence-ping', () =>
  {
    markPlayerAlive(socket.id);
  });

  socket.on('leave', () =>
  {
    removePlayer(socket.id);
  });

  socket.on('disconnect', () =>
  {
    console.log(`User disconnected: ${socket.id}`);
    removePlayer(socket.id);
  });
});

setInterval(() =>
{
  const cutoff = Date.now() - PLAYER_STALE_MS;

  Object.entries(players).forEach(([socketId, player]) =>
  {
    if ((player.lastSeenAt || 0) > cutoff) return;

    console.log(`Pruning stale player: ${socketId}`);
    removePlayer(socketId);
    io.sockets.sockets.get(socketId)?.disconnect(true);
  });
}, 5000);

// Serve static files in production
if (process.env.NODE_ENV === 'production')
{
  app.use(express.static(path.join(__dirname, 'dist')));
  app.use((req, res) =>
  {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () =>
{
  console.log(`\n🚀 Gather Server running on port ${PORT}`);
  console.log(`📍 Position Sync: Enabled`);
  console.log(`🗣  Voice Signaling: Active\n`);
});

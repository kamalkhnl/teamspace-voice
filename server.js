import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
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
  }
});

// Store all active players
const players = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join', ({ name, pos, roomId, peerId, color, audioEnabled }) => {
    // Register new player
    players[socket.id] = {
      id: socket.id,
      name,
      pos,
      roomId,
      peerId,
      color,
      isSpeaking: false,
      audioEnabled: audioEnabled || false
    };

    // Broadcast to others
    socket.broadcast.emit('player-joined', players[socket.id]);
    
    // Send current players to the new guy
    socket.emit('current-players', players);
  });

  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].pos = data.pos;
      players[socket.id].roomId = data.roomId;
      socket.broadcast.emit('player-moved', {
        id: socket.id,
        pos: data.pos,
        roomId: data.roomId
      });
    }
  });

  socket.on('speaking', (isSpeaking) => {
    if (players[socket.id]) {
      players[socket.id].isSpeaking = isSpeaking;
      socket.broadcast.emit('player-speaking', {
        id: socket.id,
        isSpeaking
      });
    }
  });

  socket.on('audio-enabled', (audioEnabled) => {
    if (players[socket.id]) {
      players[socket.id].audioEnabled = audioEnabled;
      socket.broadcast.emit('player-audio-changed', {
        id: socket.id,
        audioEnabled
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('player-left', socket.id);
  });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Gather Server running on port ${PORT}`);
  console.log(`📍 Position Sync: Enabled`);
  console.log(`🗣  Voice Signaling: Active\n`);
});

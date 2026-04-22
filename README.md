# Teamspace Voice

A browser-based virtual office workspace with real-time movement and proximity voice chat.

## Features

- Real-time multiplayer presence with Socket.IO
- Proximity-based voice communication with WebRTC (PeerJS)
- Spatial audio using the Web Audio API
- Interactive office map with rooms and collision-aware movement
- Keyboard movement (WASD / Arrow keys) and double-click path movement
- Live participant directory and speaking indicators
- Light and dark theme toggle
- Docker deployment with optional Cloudflare Tunnel

## Tech Stack

- Frontend: React + TypeScript + Vite + Tailwind CSS
- Realtime signaling: Socket.IO
- Peer media transport: PeerJS/WebRTC
- Backend: Node.js + Express + Socket.IO server

## Prerequisites

- Node.js 20+ (recommended)
- npm

## Local Development

1. Install dependencies:

```bash
npm ci
```

2. Start the frontend dev server:

```bash
npm run dev
```

3. In a separate terminal, start the signaling server:

```bash
npm run server
```

- Frontend: typically `http://localhost:5173`
- Signaling server: `http://localhost:3001`

## Production Build

Build frontend assets:

```bash
npm run build
```

Preview static frontend build:

```bash
npm run preview
```

## Available Scripts

- `npm run dev` — start Vite dev server
- `npm run server` — start Node signaling server (`server.js`)
- `npm run build` — create production frontend bundle
- `npm run preview` — preview production build
- `npm run docker:up` — start Docker services with `.env`
- `npm run docker:down` — stop Docker services
- `npm run docker:logs` — tail Docker logs

## Docker Deployment

1. Copy environment file:

```bash
cp .env.example .env
```

2. Set required values in `.env`.

3. Start containers:

```bash
npm run docker:up
```

This starts:

- `app` (Node runtime serving `dist` + Socket.IO on port `3001`)
- `cloudflared` (Cloudflare tunnel connector)

Stop services:

```bash
npm run docker:down
```

## Cloudflare Tunnel Guide

For step-by-step server deployment and tunnel setup, see:

- `DEPLOY_DOCKER_CLOUDFLARE.md`

## Usage Notes

- Click the mic control to enable audio after joining.
- Browser microphone permission is required for voice.
- Proximity voice volume changes with distance on the open floor.
- Users in the same room can hear each other clearly.

## Project Structure

- `src/` — frontend application
- `server.js` — signaling and presence server
- `docker-compose.yml` — container orchestration
- `Dockerfile` — production multi-stage image
- `scripts/` — helper deployment/update scripts

## License

No license file is currently included in this repository.

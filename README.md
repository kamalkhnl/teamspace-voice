# teamspace-voice

A browser voice-chat app. Clients connect through WebRTC (PeerJS), with a Node/Express server using Socket.IO for signalling and room state.

## Stack
React 19, Vite, Tailwind CSS, TypeScript, Express, Socket.IO, PeerJS

## Run locally
npm install
npm run dev      # front end
npm run server   # signalling server

## Deploy
Docker Compose with a Cloudflare Tunnel. See DEPLOY_DOCKER_CLOUDFLARE.md. Copy .env.example to .env and fill in your own values.

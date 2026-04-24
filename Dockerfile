# Multi-stage build: build frontend assets, then run a minimal Node runtime.
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_PEER_ICE_SERVERS
ARG VITE_PEER_HOST
ARG VITE_PEER_PORT
ARG VITE_PEER_PATH
ARG VITE_PEER_SECURE

ENV VITE_PEER_ICE_SERVERS=$VITE_PEER_ICE_SERVERS
ENV VITE_PEER_HOST=$VITE_PEER_HOST
ENV VITE_PEER_PORT=$VITE_PEER_PORT
ENV VITE_PEER_PATH=$VITE_PEER_PATH
ENV VITE_PEER_SECURE=$VITE_PEER_SECURE

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY server.js ./
COPY --from=build /app/dist ./dist

EXPOSE 3001
CMD ["node", "server.js"]

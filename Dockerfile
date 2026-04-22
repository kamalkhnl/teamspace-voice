# Multi-stage build: build frontend assets, then run a minimal Node runtime.
FROM node:20-alpine AS build
WORKDIR /app

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

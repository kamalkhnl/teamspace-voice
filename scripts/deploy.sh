#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo "Missing .env file. Create it from .env.example first."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is not available."
  exit 1
fi

echo "Building and starting gather services..."
docker compose --env-file .env up -d --build

echo "Done. Service status:"
docker compose ps

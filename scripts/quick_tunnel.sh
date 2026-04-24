#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is not available."
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"
cd "$project_root"

# If docker socket is not accessible, re-run with sudo.
if ! docker info >/dev/null 2>&1; then
  echo "Docker requires elevated access in this shell."
  echo "Run this script with sudo:"
  echo "  sudo $0"
  exit 1
fi

project_name="${COMPOSE_PROJECT_NAME:-$(basename "$project_root")}"
network_name="${project_name}_gather-net"

if ! docker network inspect "$network_name" >/dev/null 2>&1; then
  echo "Docker network '$network_name' not found. Starting app service first..."
  docker compose up -d app
fi

echo "Starting app service..."
docker compose up -d app

echo ""
echo "Starting Cloudflare Quick Tunnel (no domain required)..."
echo "Keep this process running. Your public URL will be printed below."
echo ""

docker run --rm \
  --network "$network_name" \
  cloudflare/cloudflared:latest \
  tunnel --no-autoupdate --url http://app:3001

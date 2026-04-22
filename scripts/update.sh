#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo "Missing .env file."
  exit 1
fi

echo "Pulling latest source and redeploying..."
git pull --rebase
docker compose --env-file .env up -d --build

echo "Updated."
docker compose ps

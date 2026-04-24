#!/usr/bin/env bash
# setup_coturn.sh — Install and configure coturn on Ubuntu VM
# Run this once on the VM (192.168.10.12) with: sudo bash scripts/setup_coturn.sh
set -euo pipefail

echo "=== Installing coturn ==="
apt-get update -qq
apt-get install -y coturn

echo "=== Generating self-signed TLS cert for TURNS (port 5349) ==="
if [ ! -f /etc/turn_server_cert.pem ]; then
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout /etc/turn_server_pkey.pem \
    -out /etc/turn_server_cert.pem \
    -days 3650 \
    -subj "/CN=turn.paracosma.local"
  chmod 600 /etc/turn_server_pkey.pem
  echo "  TLS cert created."
else
  echo "  TLS cert already exists, skipping."
fi

echo "=== Copying turnserver.conf ==="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/../config/turnserver.conf" /etc/turnserver.conf
echo "  Config installed to /etc/turnserver.conf"

echo "=== Enabling coturn service ==="
# Ensure TURNSERVER_ENABLED=1 in /etc/default/coturn
if grep -q '^#TURNSERVER_ENABLED' /etc/default/coturn 2>/dev/null; then
  sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
elif ! grep -q 'TURNSERVER_ENABLED=1' /etc/default/coturn 2>/dev/null; then
  echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
fi

systemctl enable coturn
systemctl restart coturn

echo ""
echo "=== coturn is running ==="
echo "Verify with:  systemctl status coturn"
echo "Logs at:      /var/log/turnserver.log"
echo ""
echo "Make sure these ports are forwarded from your public IP to this VM:"
echo "  UDP 3478  -> $(hostname -I | awk '{print $1}'):3478"
echo "  TCP 3478  -> $(hostname -I | awk '{print $1}'):3478"
echo "  TCP 5349  -> $(hostname -I | awk '{print $1}'):5349"
echo "  UDP 49160-49200 -> $(hostname -I | awk '{print $1}'):49160-49200"

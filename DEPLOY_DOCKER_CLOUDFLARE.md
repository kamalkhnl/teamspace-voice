# Deploy Gather with Docker + Cloudflare Tunnel

This guide deploys the app on an Ubuntu server inside a company network without opening inbound ports.

## No Domain Option (Cloudflare Free)

If you do not own a domain, use a Cloudflare Quick Tunnel.

- You get a temporary URL like `https://random-name.trycloudflare.com`
- No DNS setup is needed
- URL changes whenever you restart the quick tunnel

Run from the project root:

```bash
chmod +x scripts/quick_tunnel.sh
sudo ./scripts/quick_tunnel.sh
```

Keep that terminal open. The public `trycloudflare.com` URL is shown in the output.

Use this for testing/demo. For a stable URL, you need a domain in Cloudflare and a token-based named tunnel.

## 1) Prerequisites

- Ubuntu server with SSH access
- A domain managed in Cloudflare
- Docker Engine + Docker Compose plugin installed on server
- Cloudflare Zero Trust access (to create tunnel)

## 2) Install Docker on Ubuntu

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Log out and back in once after adding your user to the docker group.

## 3) Prepare project on server

```bash
mkdir -p /opt/gather
cd /opt/gather

# Clone your repo
# git clone <your-repo-url> .

cp .env.example .env
```

Edit `.env` and set your Cloudflare tunnel token:

```dotenv
CLOUDFLARE_TUNNEL_TOKEN=your_real_token_here
```

For internet voice, configure TURN on the server side and keep `VITE_PEER_ICE_SERVERS` as a fallback only.

Recommended `.env` entries:

```dotenv
TURN_URLS=turn:turn.yourcompany.com:3478?transport=udp,turns:turn.yourcompany.com:5349?transport=tcp
TURN_SHARED_SECRET=your_long_random_secret
TURN_TTL_SECONDS=86400
VITE_PEER_ICE_SERVERS=[{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}]
```

The app now fetches `/api/ice-servers` at runtime. That endpoint generates short-lived TURN credentials from `TURN_SHARED_SECRET`, which is safer than shipping static TURN passwords in the frontend.

## 4) Create Cloudflare Tunnel (Dashboard)

1. Open Cloudflare Zero Trust dashboard.
2. Go to Networks -> Tunnels -> Create tunnel.
3. Choose Cloudflared and then Docker.
4. Copy the connector token.
5. Add a Public Hostname for your app:
   - Hostname: `gather.yourcompany.com`
   - Service type: HTTP
   - URL: `app:3001`

Why `app:3001`? In this setup, `cloudflared` and your app run in the same Docker network and `app` is the service name.

## 5) Start services

```bash
chmod +x scripts/deploy.sh scripts/update.sh
./scripts/deploy.sh
```

Or directly:

```bash
docker compose --env-file .env up -d --build
```

## 6) Verify health

```bash
docker compose ps
docker compose logs -f --tail=100 app
docker compose logs -f --tail=100 cloudflared
```

Open:

- https://gather.yourcompany.com

## 7) Update deployment

```bash
./scripts/update.sh
```

## 8) Operations

Stop everything:

```bash
docker compose --env-file .env down
```

Restart:

```bash
docker compose --env-file .env restart
```

## 9) Company network firewall notes

- No inbound port opening is required.
- Server must allow outbound traffic for cloudflared.

## 10) Voice reliability note (important)

Your app uses WebRTC for media, so signaling through Cloudflare Tunnel does not guarantee media connectivity in strict corporate NAT/firewall environments.

This repo now supports runtime-issued TURN credentials from `/api/ice-servers`, but clients must still be able to reach the TURN server directly.

Recommended production setup:

1. Keep Cloudflare Tunnel for HTTPS and app signaling.
2. Run `coturn` on the VM or another host.
3. Forward company edge NAT/firewall traffic to the VM for:
   - UDP/TCP `3478`
   - TCP `5349`
   - Relay UDP range `49160-49200` or whatever you configure in `turnserver.conf`
4. Point `TURN_URLS` at the public hostname or IP that resolves to those forwarded ports.
5. Rebuild and redeploy:

```bash
docker compose --env-file .env up -d --build
```

Important constraint: Cloudflare Tunnel does not proxy TURN media. If your company network will not forward TURN ports to the VM, self-hosted TURN on this VM will not be reachable from browsers on the public internet.

# Deploy Gather with Docker + Cloudflare Tunnel

This guide deploys the app on an Ubuntu server inside a company network without opening inbound ports.

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

If voice fails for some users, add a TURN server and configure ICE servers in the client.

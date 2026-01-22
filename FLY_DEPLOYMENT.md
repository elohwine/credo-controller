# Fly.io Deployment Guide

## Prerequisites
- Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
- Login: `fly auth login`

## Secrets to Set

### API Service (credentis-api)
```bash
cd /home/eloh/PROJECTS/credo-controller

# Database encryption
fly secrets set WALLET_KEY="$(openssl rand -base64 32)" -a credentis-api

# JWT secrets
fly secrets set JWT_SECRET="$(openssl rand -base64 64)" -a credentis-api

# Agent configuration
fly secrets set AGENT_NAME="Credentis Issuer" -a credentis-api
fly secrets set AGENT_ENDPOINTS='["https://credentis-api.fly.dev"]' -a credentis-api

# Optional: EcoCash integration
# fly secrets set ECOCASH_API_URL="https://api.ecocash.co.zw" -a credentis-api
# fly secrets set ECOCASH_MERCHANT_ID="your-merchant-id" -a credentis-api
# fly secrets set ECOCASH_API_KEY="your-api-key" -a credentis-api
```

### Wallet Service (credentis-wallet)
```bash
cd /home/eloh/PROJECTS/credo-controller/credo-ui/wallet

# No secrets required - all config via env vars in fly.toml
```

### Portal Service (credentis-portal)
```bash
cd /home/eloh/PROJECTS/credo-controller/credo-ui/portal

# API authentication (if needed)
# fly secrets set NEXT_PUBLIC_ISSUER_API_KEY="your-api-key" -a credentis-portal
```

## Deployment Steps

### 1. Deploy API Service
```bash
cd /home/eloh/PROJECTS/credo-controller

# Create app (first time only)
fly launch --no-deploy --name credentis-api --region jnb --dockerfile Dockerfile

# Set secrets (see above)
fly secrets set WALLET_KEY="$(openssl rand -base64 32)" -a credentis-api
fly secrets set JWT_SECRET="$(openssl rand -base64 64)" -a credentis-api

# Deploy
fly deploy -a credentis-api

# Verify
fly status -a credentis-api
fly logs -a credentis-api
```

### 2. Deploy Wallet Service
```bash
cd /home/eloh/PROJECTS/credo-controller/credo-ui/wallet

# Create app (first time only)
fly launch --no-deploy --name credentis-wallet --region jnb --dockerfile Dockerfile

# Deploy
fly deploy -a credentis-wallet

# Verify
fly status -a credentis-wallet
fly logs -a credentis-wallet
```

### 3. Deploy Portal Service
```bash
cd /home/eloh/PROJECTS/credo-controller/credo-ui/portal

# Create app (first time only)
fly launch --no-deploy --name credentis-portal --region jnb --dockerfile Dockerfile

# Deploy
fly deploy -a credentis-portal

# Verify
fly status -a credentis-portal
fly logs -a credentis-portal
```

## Inter-Service Communication

Fly.io provides internal DNS for apps within the same organization:
- **Internal**: `http://credentis-api.internal:3000` (wallet/portal → API)
- **External**: `https://credentis-api.fly.dev` (public callbacks)

### Network Notes
- Internal traffic uses `.internal` hostnames (no TLS, private network)
- External traffic uses `.fly.dev` hostnames (automatic TLS)
- Wallet backend proxy routes `/wallet-api/*` → API holder service (port 6000)

## Persistent Storage

SQLite databases are stored in `/app/data` and use Fly volumes:

```bash
# Create volume for API (if using persistent DB)
fly volumes create credentis_data --region jnb --size 1 -a credentis-api

# Update fly.toml to mount volume
# [mounts]
#   source = "credentis_data"
#   destination = "/app/data"
```

**Note**: Current setup uses ephemeral storage. For production, add volume mounts.

## Health Checks

All services include health check endpoints:
- **API**: `GET /health` (port 3000)
- **Wallet**: Nuxt default health check
- **Portal**: Next.js default health check

## Scaling

```bash
# Scale to 2 machines
fly scale count 2 -a credentis-api

# Auto-scale (0-3 machines based on load)
fly autoscale set min=0 max=3 -a credentis-api
```

## Troubleshooting

```bash
# View logs
fly logs -a credentis-api

# SSH into machine
fly ssh console -a credentis-api

# Check resource usage
fly status -a credentis-api

# Restart app
fly apps restart credentis-api
```

## Environment Variables Summary

| Service | Variable | Value | Type |
|---------|----------|-------|------|
| API | PUBLIC_BASE_URL | https://credentis-api.fly.dev | env |
| API | WALLET_UI_URL | https://credentis-wallet.fly.dev | env |
| API | PORTAL_UI_URL | https://credentis-portal.fly.dev | env |
| API | WALLET_KEY | *generated* | secret |
| API | JWT_SECRET | *generated* | secret |
| Wallet | NUXT_PUBLIC_WALLET_BACKEND_URL | http://credentis-api.internal:6000 | env |
| Wallet | NUXT_PUBLIC_ISSUER_CALLBACK_URL | https://credentis-api.fly.dev | env |
| Portal | NEXT_PUBLIC_ISSUER_API_URL | http://credentis-api.internal:3000 | env |
| Portal | NEXT_PUBLIC_WALLET_UI_URL | https://credentis-wallet.fly.dev | env |

## Post-Deployment Verification

1. **API Health**: `curl https://credentis-api.fly.dev/health`
2. **Wallet UI**: Visit `https://credentis-wallet.fly.dev`
3. **Portal UI**: Visit `https://credentis-portal.fly.dev`
4. **Test Credential Flow**: 
   - Portal → Create offer
   - Wallet → Accept offer
   - Verify credential appears in wallet

## Cost Optimization

- Auto-stop inactive machines (already configured)
- Start at 0 min machines for development
- Scale up to 1-2 machines for production load
- Use shared-cpu-1x machine type (default)

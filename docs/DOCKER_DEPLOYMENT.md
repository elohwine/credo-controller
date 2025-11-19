# Docker Deployment Guide

This guide covers Docker-based deployment for development, testing, and production environments.

## Table of Contents

- [Quick Start](#quick-start)
- [Build Images](#build-images)
- [Run Containers](#run-containers)
- [Environment Profiles](#environment-profiles)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

- Docker Engine 20.10+ ([Install Docker](https://docs.docker.com/get-docker/))
- Docker Compose 2.0+ ([Install Compose](https://docs.docker.com/compose/install/))

Verify installations:

```bash
docker --version
docker-compose --version
```

### 1. Build the Image

```bash
# Build production image
docker-compose build credo-controller

# Or build specific stage
docker-compose build --target production credo-controller
```

### 2. Start the Service

```bash
# Start in detached mode
docker-compose up -d credo-controller

# View logs
docker-compose logs -f credo-controller

# Check health
docker-compose ps
```

### 3. Test the API

```bash
# Health check
curl http://localhost:3000/health

# Get API documentation
curl http://localhost:3000/api-docs
```

## Build Images

### Multi-Stage Build Targets

The Dockerfile includes multiple stages for different use cases:

```bash
# Production image (optimized, minimal size)
docker build --target production -t credo-controller:latest .

# Development image (with hot reload)
docker build --target development -t credo-controller:dev .

# Test image (includes test dependencies)
docker build --target test -t credo-controller:test .
```

### Build with Specific Node Version

```bash
docker build \
  --build-arg NODE_VERSION=20.18.1 \
  --target production \
  -t credo-controller:latest .
```

### Build and Verify Native Bindings

```bash
# Build and run verification
docker build --target dependencies -t credo-deps . && \
docker run --rm credo-deps \
  node -e "const { ariesAskar } = require('@hyperledger/aries-askar-nodejs'); console.log('Askar:', ariesAskar.version())"
```

Expected output:
```
✓ Askar version: 0.2.3
Askar: 0.2.3
```

## Run Containers

### Production Mode

```bash
# Start production stack
docker-compose up -d credo-controller

# Scale if needed
docker-compose up -d --scale credo-controller=3

# View logs
docker-compose logs -f credo-controller

# Stop
docker-compose down
```

### Development Mode (Hot Reload)

```bash
# Start dev environment with profile
docker-compose --profile dev up credo-dev

# Or explicitly
docker-compose up credo-dev

# Source code changes will trigger auto-reload
# Edit files in ./src and see changes reflected immediately
```

### Test Mode

```bash
# Run tests in container
docker-compose --profile test run --rm credo-test

# Run specific test file
docker-compose --profile test run --rm credo-test \
  yarn test tests/e2e/tenantIssuance.spec.ts

# Run with coverage
docker-compose --profile test run --rm credo-test \
  yarn test --coverage
```

### Interactive Shell

```bash
# Access running container
docker exec -it credo-controller sh

# Or start temporary container
docker run --rm -it credo-controller:latest sh
```

## Environment Profiles

Docker Compose profiles allow running different configurations:

### Available Profiles

| Profile | Description | Services |
|---------|-------------|----------|
| (default) | Production stack | credo-controller |
| dev | Development with hot reload | credo-dev |
| test | Test runner | credo-test |
| monitoring | Observability stack | otel-collector, jaeger |
| proxy | Nginx reverse proxy | nginx |

### Using Profiles

```bash
# Production (default)
docker-compose up -d

# Development
docker-compose --profile dev up -d

# Testing
docker-compose --profile test run --rm credo-test

# With monitoring
docker-compose --profile monitoring up -d credo-controller otel-collector jaeger

# Multiple profiles
docker-compose --profile dev --profile monitoring up -d
```

## Production Deployment

### 1. Environment Setup

```bash
# Copy environment template
cp .env.sample .env

# Edit configuration
nano .env
```

Key production settings:

```env
# Use secure random key
API_KEY=$(openssl rand -hex 32)

# Set public URL
PUBLIC_BASE_URL=https://your-domain.com

# Production log level
LOG_LEVEL=warn
AFJ_REST_LOG_LEVEL=3

# Resource limits
SESSION_LIMIT=500
INMEMORY_LRU_CACHE_LIMIT=5000
```

### 2. Use External Configuration

Create `config.json`:

```json
{
  "label": "Production Credo Agent",
  "walletConfig": {
    "id": "prod-wallet",
    "key": "your-secure-key-here"
  },
  "adminPort": 3000,
  "tenancy": true,
  "endpoints": ["https://your-domain.com"],
  "apiKey": "${API_KEY}"
}
```

### 3. Deploy Stack

```bash
# Pull latest images (if using registry)
docker-compose pull

# Build with cache from registry
docker-compose build --pull

# Start services
docker-compose up -d

# Verify health
docker-compose ps
docker-compose logs credo-controller
```

### 4. Enable TLS/SSL (with Nginx)

Create `nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream credo_backend {
        server credo-controller:3000;
    }

    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;

        location / {
            proxy_pass http://credo_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

Start with proxy:

```bash
docker-compose --profile proxy up -d
```

### 5. Monitoring Setup

Start observability stack:

```bash
# Start with monitoring profile
docker-compose --profile monitoring up -d

# Access Jaeger UI
open http://localhost:16686

# Check OTEL collector health
curl http://localhost:8888/metrics
```

Configure application to send traces:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=credo-controller
OTEL_TRACES_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
```

### 6. Data Persistence

Persistent volumes are automatically managed:

```bash
# List volumes
docker volume ls | grep credo

# Backup data volume
docker run --rm -v credo-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/credo-backup-$(date +%Y%m%d).tar.gz /data

# Restore from backup
docker run --rm -v credo-data:/data -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/credo-backup-YYYYMMDD.tar.gz --strip 1"

# Inspect volume
docker volume inspect credo-data
```

### 7. Health Checks

```bash
# Container health status
docker-compose ps

# Application health endpoint
curl http://localhost:3000/health

# Detailed health check
docker inspect --format='{{json .State.Health}}' credo-controller | jq
```

### 8. Log Management

```bash
# Follow logs
docker-compose logs -f credo-controller

# Last 100 lines
docker-compose logs --tail=100 credo-controller

# Save logs to file
docker-compose logs --no-color credo-controller > logs/credo-$(date +%Y%m%d).log

# Configure log rotation in docker-compose.yml
# (See logging section below)
```

Add to service definition:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## Troubleshooting

### Issue: Native Module Errors

**Symptom:**
```
Error: No native build was found
```

**Solution:**

1. Rebuild image from scratch:
   ```bash
   docker-compose build --no-cache credo-controller
   ```

2. Verify base image has build tools:
   ```bash
   docker run --rm node:20.18.1 gcc --version
   ```

3. Check build logs:
   ```bash
   docker-compose build credo-controller 2>&1 | tee build.log
   grep -i "error" build.log
   ```

### Issue: Container Exits Immediately

**Symptom:**
```
credo-controller exited with code 1
```

**Solution:**

1. Check logs:
   ```bash
   docker-compose logs credo-controller
   ```

2. Run interactively:
   ```bash
   docker-compose run --rm credo-controller sh
   # Then manually: node ./bin/afj-rest.js --config ./config.json
   ```

3. Verify config:
   ```bash
   docker-compose run --rm credo-controller cat /app/config.json
   ```

### Issue: Database Permission Errors

**Symptom:**
```
EACCES: permission denied, open '/app/data/tenants.db'
```

**Solution:**

1. Check volume permissions:
   ```bash
   docker-compose exec credo-controller ls -la /app/data
   ```

2. Fix ownership:
   ```bash
   docker-compose exec -u root credo-controller chown -R credo:credo /app/data
   ```

3. Or use bind mount with correct permissions:
   ```yaml
   volumes:
     - ./data:/app/data:rw
   ```
   ```bash
   chmod 777 ./data  # Or proper user mapping
   ```

### Issue: Port Already in Use

**Symptom:**
```
Bind for 0.0.0.0:3000 failed: port is already allocated
```

**Solution:**

1. Change port in `.env`:
   ```env
   PORT=3001
   ```

2. Or in docker-compose.yml:
   ```yaml
   ports:
     - "3001:3000"
   ```

3. Find what's using the port:
   ```bash
   lsof -i :3000
   sudo netstat -tulpn | grep 3000
   ```

### Issue: Out of Memory

**Symptom:**
```
JavaScript heap out of memory
```

**Solution:**

1. Increase Node.js memory:
   ```yaml
   environment:
     NODE_OPTIONS: "--max-old-space-size=4096"
   ```

2. Increase container limits:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 4G
   ```

3. Monitor usage:
   ```bash
   docker stats credo-controller
   ```

### Issue: Slow Build Times

**Solution:**

1. Use BuildKit:
   ```bash
   DOCKER_BUILDKIT=1 docker-compose build
   ```

2. Add to `.env`:
   ```env
   COMPOSE_DOCKER_CLI_BUILD=1
   DOCKER_BUILDKIT=1
   ```

3. Use build cache from registry:
   ```bash
   docker-compose build --pull --cache-from credo-controller:latest
   ```

## Docker Registry

### Push to Registry

```bash
# Tag image
docker tag credo-controller:latest your-registry.com/credo-controller:latest
docker tag credo-controller:latest your-registry.com/credo-controller:v1.0.0

# Push
docker push your-registry.com/credo-controller:latest
docker push your-registry.com/credo-controller:v1.0.0
```

### Pull from Registry

```bash
# In docker-compose.yml, replace build with image
image: your-registry.com/credo-controller:latest

# Pull and run
docker-compose pull
docker-compose up -d
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Docker image
        run: docker build --target production -t credo-controller:${{ github.sha }} .
      
      - name: Run tests
        run: docker run --rm credo-controller:${{ github.sha }} yarn test
      
      - name: Push to registry
        run: |
          echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin
          docker push credo-controller:${{ github.sha }}
```

## Performance Tuning

### Resource Limits

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 2G
    reservations:
      cpus: '0.5'
      memory: 512M
```

### Connection Pooling

```env
SESSION_LIMIT=500
SESSION_ACQUIRE_TIMEOUT=30000
INMEMORY_LRU_CACHE_LIMIT=5000
```

### Multi-container Scaling

```bash
# Scale horizontally
docker-compose up -d --scale credo-controller=3

# With load balancer (nginx)
docker-compose --profile proxy up -d --scale credo-controller=3
```

## Security Best Practices

1. **Run as non-root user** (already configured in Dockerfile)
2. **Use secrets management**:
   ```bash
   docker secret create api_key ./api_key.txt
   ```
3. **Scan images for vulnerabilities**:
   ```bash
   docker scan credo-controller:latest
   ```
4. **Keep base images updated**
5. **Use TLS for all external communication**
6. **Limit exposed ports**
7. **Regular backups of data volumes**

## Support

- Docker Documentation: https://docs.docker.com/
- Credo.js Docs: https://credo.js.org/
- GitHub Issues: https://github.com/elohwine/credo-controller/issues

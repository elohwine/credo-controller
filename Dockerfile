# ============================================
# Stage 1: Base with native build dependencies
# ============================================
FROM node:20.18.1 AS base

# Install system dependencies for native module compilation
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    python3-pip \
    pkg-config \
    libssl-dev \
    cmake \
    git \
    curl \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ============================================
# Stage 2: Dependencies builder
# ============================================
FROM base AS dependencies

# Copy package files
COPY package.json yarn.lock ./
COPY patches ./patches

# Install ALL dependencies (including dev dependencies for building)
RUN yarn install --frozen-lockfile --network-timeout 600000

# Apply patches
RUN yarn postinstall

# Rebuild native modules to ensure compatibility
RUN npm rebuild @hyperledger/aries-askar-nodejs --build-from-source || true
RUN npm rebuild @hyperledger/anoncreds-nodejs --build-from-source || true
RUN npm rebuild better-sqlite3 --build-from-source || true

# Verify Askar loaded correctly
RUN node -e "const { ariesAskar } = require('@hyperledger/aries-askar-nodejs'); console.log('✓ Askar version:', ariesAskar.version())" || \
    (echo "ERROR: Askar native binding failed to load" && exit 1)

# ============================================
# Stage 3: Builder (compile TypeScript)
# ============================================
FROM dependencies AS builder

# Copy source code
COPY tsconfig.json tsconfig.build.json tsconfig.eslint.json ./
COPY tsoa.json ./
COPY scripts ./scripts
COPY src ./src
COPY migrations ./migrations
COPY samples ./samples

# Build application (generates routes, patches swagger, compiles TS)
RUN yarn build

# Verify build artifacts
RUN ls -la build/ && \
    test -f build/index.js && \
    test -f src/routes/routes.ts && \
    test -f src/routes/swagger.json

# ============================================
# Stage 4: Production runtime
# ============================================
FROM node:20.18.1-slim AS production

# Install only runtime dependencies (no build tools)
RUN apt-get update && apt-get install -y \
    libssl3 \
    sqlite3 \
    ca-certificates \
    tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user for security
RUN groupadd -r credo && useradd -r -g credo credo

# Copy built application from builder
COPY --from=builder --chown=credo:credo /app/build ./build
COPY --from=builder --chown=credo:credo /app/bin ./bin
COPY --from=builder --chown=credo:credo /app/src/routes ./src/routes
COPY --from=builder --chown=credo:credo /app/migrations ./migrations
COPY --from=builder --chown=credo:credo /app/samples ./samples
COPY --from=builder --chown=credo:credo /app/package.json ./

# Copy production node_modules with native bindings
COPY --from=builder --chown=credo:credo /app/node_modules ./node_modules

# Create data directory for SQLite databases
RUN mkdir -p /app/data && chown -R credo:credo /app/data

# Expose port
EXPOSE 3000 6000 6001

# Use tini as init system (handles signals properly)
ENTRYPOINT ["/usr/bin/tini", "--"]

# Switch to non-root user
USER credo

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Defaultt command (run issuer + holder servers)
CMD ["sh", "-c", "node ./samples/startServer.js & node ./samples/startHolderServer.js"]

# ============================================
# Stage 5: Development image (with hot reload)
# ============================================
FROM dependencies AS development

# Copy source code
COPY . .

# Build once for initial routes
RUN yarn build

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000

# Use ts-node-dev for hot reload
CMD ["yarn", "dev"]

# ============================================
# Stage 6: Test runner
# ============================================
FROM dependencies AS test

# Copy all source files
COPY . .

# Build application
RUN yarn build

# Create test data directory
RUN mkdir -p /app/data

# Run type checking
RUN yarn check-types

# Run linting
RUN yarn lint || true

# Default: run tests
CMD ["yarn", "test"]

# Local Development Setup

This guide covers setting up the development environment with native Askar bindings for local development and testing.

## Prerequisites

### System Dependencies (Ubuntu/Debian)

```bash
# Update package list
sudo apt-get update

# Install build essentials and dependencies
sudo apt-get install -y \
  build-essential \
  python3 \
  python3-pip \
  pkg-config \
  libssl-dev \
  cmake \
  git \
  curl

# Verify installations
gcc --version
python3 --version
cmake --version
```

### System Dependencies (macOS)

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install cmake openssl pkg-config python3

# Verify installations
gcc --version
python3 --version
cmake --version
```

### System Dependencies (Windows)

```powershell
# Install Visual Studio Build Tools
# Download from: https://visualstudio.microsoft.com/downloads/
# Select "Desktop development with C++" workload

# Install Python 3
# Download from: https://www.python.org/downloads/

# Install CMake
choco install cmake

# Or download from: https://cmake.org/download/
```

## Node.js Setup

Ensure you have Node.js 20+ installed:

```bash
node --version  # Should be >= 20.0.0
```

If not, install via nvm:

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install Node.js 20
nvm install 20
nvm use 20
```

## Project Setup

### 1. Clean Install

```bash
# Navigate to project
cd /path/to/credo-controller

# Remove existing node_modules and lock files
rm -rf node_modules
rm -f yarn.lock package-lock.json

# Install dependencies (this will trigger native builds)
yarn install --frozen-lockfile

# Apply patches
yarn postinstall
```

### 2. Rebuild Native Modules

If you encounter native binding errors:

```bash
# Rebuild all native modules
npm rebuild

# Or specifically rebuild Askar
npm rebuild @hyperledger/aries-askar-nodejs

# Or rebuild with verbose logging
npm rebuild @hyperledger/aries-askar-nodejs --verbose
```

### 3. Verify Installation

```bash
# Check if Askar loads correctly
node -e "const { ariesAskar } = require('@hyperledger/aries-askar-nodejs'); console.log('Askar version:', ariesAskar.version())"
```

Expected output:
```
Askar version: 0.2.3
```

## Build and Run

### Development Mode

```bash
# Compile TypeScript and generate routes
yarn build

# Start development server with hot reload
yarn dev

# Or start with sample config
yarn start:dev
```

### Run Tests

```bash
# Run all tests
yarn test

# Run specific e2e test
npx jest tests/e2e/tenantIssuance.spec.ts --runInBand

# Run with coverage
yarn test --coverage
```

## Troubleshooting

### Issue: "No native build was found"

**Symptom:**
```
No native build was found for platform=linux arch=x64 runtime=node abi=127
```

**Solutions:**

1. **Check Node.js version compatibility:**
   ```bash
   node --version
   # Should be 20.x (stable LTS)
   ```

2. **Rebuild native modules:**
   ```bash
   npm rebuild --build-from-source
   ```

3. **Clear cache and reinstall:**
   ```bash
   rm -rf node_modules ~/.node-gyp ~/.npm/_cacache
   yarn cache clean
   yarn install
   ```

4. **Check build tools:**
   ```bash
   # Verify gcc/g++
   gcc --version
   g++ --version
   
   # Verify Python 3
   python3 --version
   ```

### Issue: "Cannot find module '@credo-ts/core'"

**Solution:**
```bash
# Ensure all dependencies are installed
yarn install

# Check for duplicate versions
yarn list @credo-ts/core

# Force resolution if needed (see package.json resolutions)
```

### Issue: Build fails with OpenSSL errors

**Ubuntu/Debian:**
```bash
sudo apt-get install -y libssl-dev
```

**macOS:**
```bash
brew install openssl
export OPENSSL_ROOT_DIR=$(brew --prefix openssl)
npm rebuild
```

### Issue: Python errors during build

**Ensure Python 3 is available as 'python':**
```bash
# Create symlink if needed
sudo ln -s /usr/bin/python3 /usr/bin/python

# Or set npm config
npm config set python python3
```

## Environment Configuration

Create a `.env` file in the project root:

```bash
# Copy sample
cp .env.sample .env

# Edit configuration
nano .env
```

Required environment variables:

```env
# Database paths
TENANT_DB_PATH=./data/tenants.db
OIDC_DB_PATH=./data/oidc.db

# Server config
PUBLIC_BASE_URL=http://localhost:3000
PORT=3000

# API Key (generate secure key)
API_KEY=your-secure-api-key-here

# Logging
LOG_LEVEL=debug

# OpenTelemetry (optional)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

## Database Initialization

```bash
# Create data directory
mkdir -p data

# Databases will be created automatically on first run
# Or manually initialize:
sqlite3 data/tenants.db < migrations/001_create_stores.sql
```

## IDE Setup

### VS Code

Install recommended extensions:

```bash
# Install extensions
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension firsttris.vscode-jest-runner
```

Settings (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib",
  "jest.autoRun": "off"
}
```

## Development Workflow

```bash
# 1. Start in dev mode with hot reload
yarn dev

# 2. In another terminal, run tests in watch mode
yarn test --watch

# 3. Make changes to src/

# 4. Regenerate routes after controller changes
yarn run tsoa
node ./scripts/patch-swagger.js

# 5. Or use full build
yarn build
```

## Performance Tips

### Faster Rebuilds

```bash
# Use ts-node-dev for hot reload (already configured in yarn dev)
yarn dev

# Or use nodemon
nodemon --exec ts-node src/index.ts
```

### Parallel Testing

```bash
# Run tests in parallel (default)
yarn test

# Run in band for debugging
yarn test --runInBand
```

## Next Steps

- Review [Docker Setup](../README.md#docker) for containerized deployment
- See [API Documentation](../src/routes/swagger.json) for endpoint details
- Check [Testing Guide](./TESTING.md) for test patterns

## Support

If you encounter issues:

1. Check GitHub Issues: https://github.com/elohwine/credo-controller/issues
2. Review Credo.js docs: https://credo.js.org/
3. Askar troubleshooting: https://github.com/hyperledger/aries-askar

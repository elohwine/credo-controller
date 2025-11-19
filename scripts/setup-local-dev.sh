#!/bin/bash

# ===========================================
# Credo Controller - Local Dev Setup Script
# ===========================================

set -e  # Exit on error

echo "🚀 Setting up Credo Controller for local development..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check Node.js version
echo "1️⃣  Checking Node.js version..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    echo "   Please install Node.js 20+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    print_error "Node.js version must be 20 or higher (found v$NODE_VERSION)"
    echo "   Install via: nvm install 20 && nvm use 20"
    exit 1
fi
print_success "Node.js $(node -v) found"

# Check build tools
echo ""
echo "2️⃣  Checking build dependencies..."

# Check GCC
if ! command -v gcc &> /dev/null; then
    print_error "GCC not found"
    echo "   Ubuntu/Debian: sudo apt-get install build-essential"
    echo "   macOS: xcode-select --install"
    exit 1
fi
print_success "GCC $(gcc --version | head -n1 | awk '{print $NF}')"

# Check Python
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 not found"
    echo "   Ubuntu/Debian: sudo apt-get install python3"
    echo "   macOS: brew install python3"
    exit 1
fi
print_success "Python $(python3 --version | awk '{print $2}')"

# Check CMake
if ! command -v cmake &> /dev/null; then
    print_error "CMake not found"
    echo "   Ubuntu/Debian: sudo apt-get install cmake"
    echo "   macOS: brew install cmake"
    exit 1
fi
print_success "CMake $(cmake --version | head -n1 | awk '{print $3}')"

# Clean install
echo ""
echo "3️⃣  Cleaning old installation..."
if [ -d "node_modules" ]; then
    print_info "Removing node_modules..."
    rm -rf node_modules
fi
if [ -f "yarn.lock" ]; then
    print_info "Removing yarn.lock..."
    rm -f yarn.lock
fi
print_success "Clean complete"

# Install dependencies
echo ""
echo "4️⃣  Installing dependencies..."
print_info "This may take 5-10 minutes..."
if ! yarn install --frozen-lockfile; then
    print_error "Dependency installation failed"
    exit 1
fi
print_success "Dependencies installed"

# Apply patches
echo ""
echo "5️⃣  Applying patches..."
if ! yarn postinstall; then
    print_error "Patch application failed"
    exit 1
fi
print_success "Patches applied"

# Rebuild native modules
echo ""
echo "6️⃣  Rebuilding native modules..."
print_info "Rebuilding Askar native bindings..."
if ! npm rebuild @hyperledger/aries-askar-nodejs; then
    print_error "Askar rebuild failed"
    exit 1
fi
print_success "Native modules rebuilt"

# Verify Askar
echo ""
echo "7️⃣  Verifying Askar installation..."
if node -e "const { ariesAskar } = require('@hyperledger/aries-askar-nodejs'); console.log('Askar version:', ariesAskar.version())" 2>/dev/null; then
    print_success "Askar loaded successfully"
else
    print_error "Askar verification failed"
    echo ""
    echo "Troubleshooting steps:"
    echo "  1. Check logs above for specific errors"
    echo "  2. Try: npm rebuild --build-from-source"
    echo "  3. Verify libssl-dev is installed: dpkg -l | grep libssl"
    echo "  4. Check GitHub issues: https://github.com/hyperledger/aries-askar/issues"
    exit 1
fi

# Create data directory
echo ""
echo "8️⃣  Creating data directory..."
mkdir -p data
print_success "Data directory created"

# Create .env if it doesn't exist
echo ""
echo "9️⃣  Setting up environment..."
if [ ! -f ".env" ]; then
    if [ -f ".env.sample" ]; then
        cp .env.sample .env
        print_success "Created .env from template"
        print_info "Please edit .env and set your API_KEY"
    else
        print_info ".env.sample not found, skipping"
    fi
else
    print_info ".env already exists"
fi

# Build project
echo ""
echo "🔟 Building project..."
if ! yarn build; then
    print_error "Build failed"
    exit 1
fi
print_success "Build complete"

# Success message
echo ""
echo "═══════════════════════════════════════════"
echo -e "${GREEN}✓ Setup complete!${NC}"
echo "═══════════════════════════════════════════"
echo ""
echo "Next steps:"
echo ""
echo "  1. Configure environment:"
echo "     ${YELLOW}nano .env${NC}"
echo ""
echo "  2. Start development server:"
echo "     ${YELLOW}yarn dev${NC}"
echo ""
echo "  3. Or start with sample config:"
echo "     ${YELLOW}yarn start:dev${NC}"
echo ""
echo "  4. Run tests:"
echo "     ${YELLOW}yarn test${NC}"
echo ""
echo "  5. View API docs:"
echo "     ${YELLOW}open http://localhost:3000/api-docs${NC}"
echo ""
echo "For more information:"
echo "  - Local dev guide: ${YELLOW}docs/LOCAL_DEV_SETUP.md${NC}"
echo "  - Docker guide: ${YELLOW}docs/DOCKER_DEPLOYMENT.md${NC}"
echo ""

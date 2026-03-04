#!/bin/bash

#===============================================================================
# IPTV Web Player - Rebuild Frontend
# Forces a complete rebuild of the frontend
#===============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$SCRIPT_DIR/client"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              IPTV Web Player - Rebuild Frontend                  ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if client directory exists
if [ ! -d "$CLIENT_DIR" ]; then
    log_error "Client directory not found: $CLIENT_DIR"
    exit 1
fi

cd "$CLIENT_DIR"

# Option to do a full clean
FULL_CLEAN=false
if [[ "$1" == "--full" || "$1" == "-f" ]]; then
    FULL_CLEAN=true
fi

if $FULL_CLEAN; then
    log_info "Full clean mode - removing node_modules..."
    rm -rf node_modules
    rm -rf .vite
    rm -f package-lock.json
fi

# Always clean dist and cache
log_info "Cleaning build artifacts..."
rm -rf dist
rm -rf .vite

# Check if node_modules exists, if not install dependencies
if [ ! -d "node_modules" ]; then
    log_warn "node_modules not found, installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        log_error "Failed to install dependencies!"
        exit 1
    fi
    log_success "Dependencies installed"
fi

# Check if vite exists
if [ ! -f "node_modules/.bin/vite" ]; then
    log_warn "Vite not found, reinstalling dependencies..."
    rm -rf node_modules
    npm install
    if [ $? -ne 0 ]; then
        log_error "Failed to install dependencies!"
        exit 1
    fi
fi

# Rebuild
log_info "Building frontend..."
if npm run build; then
    log_success "Frontend rebuilt successfully!"
    echo ""

    # Show build stats
    if [ -d "dist" ]; then
        DIST_SIZE=$(du -sh dist 2>/dev/null | cut -f1)
        FILE_COUNT=$(find dist -type f | wc -l)
        echo "Build stats:"
        echo "  - Size: $DIST_SIZE"
        echo "  - Files: $FILE_COUNT"
    fi
else
    log_error "Build failed!"
    exit 1
fi

echo ""
log_info "To apply changes:"
echo "  - Development: restart 'npm run dev' in client folder"
echo "  - Production: restart the service with './restart.sh'"
echo ""

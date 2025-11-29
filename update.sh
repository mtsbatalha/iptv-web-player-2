#!/bin/bash

#===============================================================================
# IPTV Web Player - Updater
# Updates the application while preserving configuration and data
#===============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="/opt/iptv-web-player"
APP_USER="iptv"

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

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

echo ""
echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                                                                  ║"
echo "║              IPTV Web Player - Updater                           ║"
echo "║                                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

check_root

# Check if application is installed
if [ ! -d "${INSTALL_DIR}" ]; then
    log_error "IPTV Web Player is not installed at ${INSTALL_DIR}"
    log_error "Please run install.sh first"
    exit 1
fi

# Get source directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "${SCRIPT_DIR}/package.json" ]; then
    log_error "Please run this script from the project source directory"
    exit 1
fi

echo "This will update IPTV Web Player from: ${SCRIPT_DIR}"
echo "To installation at: ${INSTALL_DIR}"
echo ""
echo "The following will be preserved:"
echo "  - .env configuration"
echo "  - recordings/"
echo "  - uploads/"
echo "  - Database data"
echo ""
read -p "Continue with update? (y/N): " -n 1 -r
echo
[[ ! $REPLY =~ ^[Yy]$ ]] && exit 1

echo ""
log_info "Starting update..."

# Backup current .env
log_info "Backing up configuration..."
cp ${INSTALL_DIR}/.env /tmp/iptv-env-backup

# Stop service
log_info "Stopping service..."
systemctl stop iptv-web-player || true

# Backup recordings and uploads temporarily
if [ -d "${INSTALL_DIR}/recordings" ]; then
    log_info "Preserving recordings..."
    mv ${INSTALL_DIR}/recordings /tmp/iptv-recordings-preserve
fi

if [ -d "${INSTALL_DIR}/uploads" ]; then
    log_info "Preserving uploads..."
    mv ${INSTALL_DIR}/uploads /tmp/iptv-uploads-preserve
fi

# Remove old node_modules but keep data directories
log_info "Cleaning old installation..."
rm -rf ${INSTALL_DIR}/node_modules
rm -rf ${INSTALL_DIR}/client/node_modules
rm -rf ${INSTALL_DIR}/client/dist

# Update source files
log_info "Copying new files..."
rsync -av --exclude 'node_modules' \
          --exclude '.env' \
          --exclude 'recordings' \
          --exclude 'uploads' \
          --exclude '.git' \
          --exclude 'INSTALLATION_INFO.txt' \
          ${SCRIPT_DIR}/ ${INSTALL_DIR}/

# Restore .env
log_info "Restoring configuration..."
mv /tmp/iptv-env-backup ${INSTALL_DIR}/.env

# Restore recordings and uploads
if [ -d "/tmp/iptv-recordings-preserve" ]; then
    log_info "Restoring recordings..."
    mv /tmp/iptv-recordings-preserve ${INSTALL_DIR}/recordings
else
    mkdir -p ${INSTALL_DIR}/recordings
fi

if [ -d "/tmp/iptv-uploads-preserve" ]; then
    log_info "Restoring uploads..."
    mv /tmp/iptv-uploads-preserve ${INSTALL_DIR}/uploads
else
    mkdir -p ${INSTALL_DIR}/uploads
fi

# Fix ownership
chown -R ${APP_USER}:${APP_USER} ${INSTALL_DIR}

# Install dependencies
log_info "Installing backend dependencies..."
cd ${INSTALL_DIR}
sudo -u ${APP_USER} npm install --omit=dev

log_info "Installing frontend dependencies..."
cd ${INSTALL_DIR}/client
sudo -u ${APP_USER} npm install

log_info "Building frontend..."
sudo -u ${APP_USER} npm run build

# Run migrations (if any new ones)
log_info "Running database migrations..."
cd ${INSTALL_DIR}
sudo -u ${APP_USER} npm run db:migrate || log_warn "Migration failed or no new migrations"

# Start service
log_info "Starting service..."
systemctl start iptv-web-player

# Check status
sleep 2
if systemctl is-active --quiet iptv-web-player; then
    log_success "Service started successfully"
else
    log_error "Service failed to start. Check logs with: journalctl -u iptv-web-player -n 50"
fi

echo ""
log_success "Update complete!"
echo ""
log_info "Service status:"
systemctl status iptv-web-player --no-pager
echo ""

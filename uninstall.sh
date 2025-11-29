#!/bin/bash

#===============================================================================
# IPTV Web Player - Uninstaller
#===============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="/opt/iptv-web-player"
APP_USER="iptv"
DB_NAME="iptv_player"
DB_USER="iptv_user"

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
echo -e "${RED}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                                                                  ║"
echo "║              IPTV Web Player - Uninstaller                       ║"
echo "║                                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

check_root

echo -e "${YELLOW}WARNING: This will remove the IPTV Web Player installation!${NC}"
echo ""
echo "The following will be removed:"
echo "  - Application files: ${INSTALL_DIR}"
echo "  - Systemd service: iptv-web-player"
echo "  - Nginx configuration"
echo "  - User: ${APP_USER}"
echo ""

read -p "Do you also want to remove the database? (y/N): " -n 1 -r
echo
REMOVE_DB=$REPLY

read -p "Do you also want to remove recordings? (y/N): " -n 1 -r
echo
REMOVE_RECORDINGS=$REPLY

echo ""
read -p "Are you sure you want to uninstall? (y/N): " -n 1 -r
echo
[[ ! $REPLY =~ ^[Yy]$ ]] && exit 1

echo ""
log_info "Starting uninstallation..."

# Stop and disable service
if systemctl is-active --quiet iptv-web-player 2>/dev/null; then
    log_info "Stopping IPTV Web Player service..."
    systemctl stop iptv-web-player
fi

if systemctl is-enabled --quiet iptv-web-player 2>/dev/null; then
    log_info "Disabling IPTV Web Player service..."
    systemctl disable iptv-web-player
fi

# Remove systemd service
if [ -f /etc/systemd/system/iptv-web-player.service ]; then
    log_info "Removing systemd service..."
    rm -f /etc/systemd/system/iptv-web-player.service
    systemctl daemon-reload
fi

# Remove Nginx configuration
if [ -f /etc/nginx/sites-enabled/iptv-web-player ]; then
    log_info "Removing Nginx configuration..."
    rm -f /etc/nginx/sites-enabled/iptv-web-player
fi

if [ -f /etc/nginx/sites-available/iptv-web-player ]; then
    rm -f /etc/nginx/sites-available/iptv-web-player
fi

if systemctl is-active --quiet nginx; then
    systemctl reload nginx
fi

# Backup recordings if not removing
if [[ ! $REMOVE_RECORDINGS =~ ^[Yy]$ ]] && [ -d "${INSTALL_DIR}/recordings" ]; then
    if [ "$(ls -A ${INSTALL_DIR}/recordings 2>/dev/null)" ]; then
        BACKUP_DIR="/root/iptv-recordings-backup-$(date +%Y%m%d%H%M%S)"
        log_info "Backing up recordings to ${BACKUP_DIR}..."
        mv ${INSTALL_DIR}/recordings ${BACKUP_DIR}
        log_success "Recordings backed up to: ${BACKUP_DIR}"
    fi
fi

# Remove application directory
if [ -d "${INSTALL_DIR}" ]; then
    log_info "Removing application directory..."
    rm -rf ${INSTALL_DIR}
fi

# Remove user
if id "${APP_USER}" &>/dev/null; then
    log_info "Removing user ${APP_USER}..."
    userdel ${APP_USER} 2>/dev/null || true
fi

# Remove database
if [[ $REMOVE_DB =~ ^[Yy]$ ]]; then
    log_info "Removing database..."
    read -s -p "Enter MySQL root password: " MYSQL_ROOT_PASSWORD
    echo

    mysql --user=root --password="${MYSQL_ROOT_PASSWORD}" <<EOF 2>/dev/null || log_warn "Could not remove database - manual cleanup may be needed"
DROP DATABASE IF EXISTS ${DB_NAME};
DROP USER IF EXISTS '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF
    log_success "Database removed"
fi

echo ""
log_success "IPTV Web Player has been uninstalled!"
echo ""

if [[ ! $REMOVE_DB =~ ^[Yy]$ ]]; then
    log_warn "Database '${DB_NAME}' was NOT removed."
    log_warn "To remove manually, run:"
    echo "  mysql -u root -p -e \"DROP DATABASE ${DB_NAME}; DROP USER '${DB_USER}'@'localhost';\""
fi

echo ""

#!/bin/bash

#===============================================================================
# IPTV Web Player - Restart Service
#===============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

SERVICE_NAME="iptv-web-player"
TIMEOUT=10

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}[ERROR]${NC} This script must be run as root (use sudo)"
    exit 1
fi

# Check if service exists
if ! systemctl list-unit-files | grep -q "$SERVICE_NAME"; then
    echo -e "${RED}[ERROR]${NC} Service $SERVICE_NAME is not installed"
    echo "Run install.sh first to install the application"
    exit 1
fi

echo -e "${BLUE}[INFO]${NC} Restarting $SERVICE_NAME..."

# Use timeout to prevent hanging
if timeout $TIMEOUT systemctl restart "$SERVICE_NAME"; then
    # Wait a moment for the service to fully start
    sleep 2

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo -e "${GREEN}[SUCCESS]${NC} $SERVICE_NAME restarted successfully"
        echo ""
        systemctl status "$SERVICE_NAME" --no-pager -l
    else
        echo -e "${RED}[ERROR]${NC} Service restarted but is not running"
        echo ""
        echo "Recent logs:"
        journalctl -u "$SERVICE_NAME" -n 20 --no-pager
        exit 1
    fi
else
    echo -e "${RED}[ERROR]${NC} Failed to restart $SERVICE_NAME (timeout after ${TIMEOUT}s)"
    echo ""
    echo "Trying to get service status..."
    systemctl status "$SERVICE_NAME" --no-pager -l || true
    echo ""
    echo "Recent logs:"
    journalctl -u "$SERVICE_NAME" -n 20 --no-pager
    exit 1
fi

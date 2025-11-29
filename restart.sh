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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}[ERROR]${NC} This script must be run as root (use sudo)"
    exit 1
fi

echo -e "${BLUE}[INFO]${NC} Restarting $SERVICE_NAME..."

if systemctl restart "$SERVICE_NAME"; then
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo -e "${GREEN}[SUCCESS]${NC} $SERVICE_NAME restarted successfully"
        echo ""
        systemctl status "$SERVICE_NAME" --no-pager
    else
        echo -e "${RED}[ERROR]${NC} Service restarted but is not running"
        echo "Check logs with: journalctl -u $SERVICE_NAME -n 50"
        exit 1
    fi
else
    echo -e "${RED}[ERROR]${NC} Failed to restart $SERVICE_NAME"
    echo "Check logs with: journalctl -u $SERVICE_NAME -n 50"
    exit 1
fi

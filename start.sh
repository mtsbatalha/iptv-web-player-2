#!/bin/bash

#===============================================================================
# IPTV Web Player - Start Service
#===============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

SERVICE_NAME="iptv-web-player"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}[ERROR]${NC} This script must be run as root (use sudo)"
    exit 1
fi

echo -e "${BLUE}[INFO]${NC} Starting $SERVICE_NAME..."

if systemctl start "$SERVICE_NAME"; then
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo -e "${GREEN}[SUCCESS]${NC} $SERVICE_NAME started successfully"
        echo ""
        systemctl status "$SERVICE_NAME" --no-pager
    else
        echo -e "${RED}[ERROR]${NC} Service started but is not running"
        echo "Check logs with: journalctl -u $SERVICE_NAME -n 50"
        exit 1
    fi
else
    echo -e "${RED}[ERROR]${NC} Failed to start $SERVICE_NAME"
    echo "Check logs with: journalctl -u $SERVICE_NAME -n 50"
    exit 1
fi

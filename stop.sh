#!/bin/bash

#===============================================================================
# IPTV Web Player - Stop Service
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
    exit 1
fi

# Check if already stopped
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    echo -e "${YELLOW}[WARNING]${NC} $SERVICE_NAME is not running"
    exit 0
fi

echo -e "${BLUE}[INFO]${NC} Stopping $SERVICE_NAME..."

if timeout $TIMEOUT systemctl stop "$SERVICE_NAME"; then
    sleep 1

    if ! systemctl is-active --quiet "$SERVICE_NAME"; then
        echo -e "${GREEN}[SUCCESS]${NC} $SERVICE_NAME stopped successfully"
    else
        echo -e "${RED}[ERROR]${NC} Stop command succeeded but service is still running"
        echo "Trying force kill..."
        systemctl kill "$SERVICE_NAME"
        sleep 1
        if ! systemctl is-active --quiet "$SERVICE_NAME"; then
            echo -e "${GREEN}[SUCCESS]${NC} Service killed successfully"
        else
            echo -e "${RED}[ERROR]${NC} Could not stop service"
            exit 1
        fi
    fi
else
    echo -e "${RED}[ERROR]${NC} Failed to stop $SERVICE_NAME (timeout after ${TIMEOUT}s)"
    echo "Trying force kill..."
    systemctl kill "$SERVICE_NAME" || true
    exit 1
fi

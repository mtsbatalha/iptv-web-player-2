#!/bin/bash

#===============================================================================
# IPTV Web Player - Service Status
#===============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SERVICE_NAME="iptv-web-player"
INSTALL_DIR="/opt/iptv-web-player"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║              IPTV Web Player - Status                            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Service Status
echo -e "${BLUE}[SERVICE STATUS]${NC}"
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo -e "  Status: ${GREEN}● Running${NC}"
else
    echo -e "  Status: ${RED}● Stopped${NC}"
fi

if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo -e "  Auto-start: ${GREEN}Enabled${NC}"
else
    echo -e "  Auto-start: ${YELLOW}Disabled${NC}"
fi

echo ""

# Process Info
echo -e "${BLUE}[PROCESS INFO]${NC}"
PID=$(systemctl show -p MainPID --value "$SERVICE_NAME" 2>/dev/null)
if [[ "$PID" != "0" && -n "$PID" ]]; then
    echo "  PID: $PID"

    # Memory usage
    if [ -f "/proc/$PID/status" ]; then
        MEM=$(grep VmRSS /proc/$PID/status 2>/dev/null | awk '{print $2}')
        if [ -n "$MEM" ]; then
            MEM_MB=$((MEM / 1024))
            echo "  Memory: ${MEM_MB} MB"
        fi
    fi

    # Uptime
    UPTIME=$(ps -o etime= -p "$PID" 2>/dev/null | tr -d ' ')
    if [ -n "$UPTIME" ]; then
        echo "  Uptime: $UPTIME"
    fi
else
    echo "  PID: N/A"
fi

echo ""

# Port Info
echo -e "${BLUE}[LISTENING PORTS]${NC}"
if [ -f "$INSTALL_DIR/.env" ]; then
    PORT=$(grep "^PORT=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d'=' -f2)
    if [ -n "$PORT" ]; then
        echo "  API Server: $PORT"

        # Check if port is actually listening
        if command -v ss &> /dev/null; then
            if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
                echo -e "    ${GREEN}● Port is active${NC}"
            else
                echo -e "    ${RED}● Port not listening${NC}"
            fi
        fi
    fi
fi

echo ""

# Disk Usage
echo -e "${BLUE}[DISK USAGE]${NC}"
if [ -d "$INSTALL_DIR" ]; then
    TOTAL_SIZE=$(du -sh "$INSTALL_DIR" 2>/dev/null | cut -f1)
    echo "  Installation: $TOTAL_SIZE"

    if [ -d "$INSTALL_DIR/recordings" ]; then
        REC_SIZE=$(du -sh "$INSTALL_DIR/recordings" 2>/dev/null | cut -f1)
        echo "  Recordings: $REC_SIZE"
    fi

    if [ -d "$INSTALL_DIR/uploads" ]; then
        UPL_SIZE=$(du -sh "$INSTALL_DIR/uploads" 2>/dev/null | cut -f1)
        echo "  Uploads: $UPL_SIZE"
    fi
fi

echo ""

# Database Status
echo -e "${BLUE}[DATABASE]${NC}"
if systemctl is-active --quiet mysql 2>/dev/null; then
    echo -e "  MySQL: ${GREEN}● Running${NC}"
elif systemctl is-active --quiet mariadb 2>/dev/null; then
    echo -e "  MariaDB: ${GREEN}● Running${NC}"
else
    echo -e "  Database: ${RED}● Not running${NC}"
fi

echo ""

# Recent Logs
echo -e "${BLUE}[RECENT LOGS]${NC}"
echo "  Last 5 log entries:"
journalctl -u "$SERVICE_NAME" -n 5 --no-pager 2>/dev/null | while read -r line; do
    echo "    $line"
done

echo ""
echo -e "${CYAN}Commands:${NC}"
echo "  sudo ./start.sh    - Start service"
echo "  sudo ./stop.sh     - Stop service"
echo "  sudo ./restart.sh  - Restart service"
echo "  sudo journalctl -u $SERVICE_NAME -f  - Follow logs"
echo ""

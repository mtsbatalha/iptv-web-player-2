#!/bin/bash

#===============================================================================
# IPTV Web Player - View Logs
#===============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SERVICE_NAME="iptv-web-player"

show_help() {
    echo -e "${CYAN}IPTV Web Player - Log Viewer${NC}"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -f, --follow     Follow logs in real-time (default)"
    echo "  -n, --lines NUM  Show last NUM lines (default: 100)"
    echo "  -e, --errors     Show only errors"
    echo "  -t, --today      Show only today's logs"
    echo "  -h, --help       Show this help"
    echo ""
    echo "Examples:"
    echo "  $0              # Follow logs in real-time"
    echo "  $0 -n 50        # Show last 50 lines"
    echo "  $0 -e           # Show only errors"
    echo "  $0 -t -n 200    # Show last 200 lines from today"
    echo ""
}

# Default values
FOLLOW=true
LINES=100
ERRORS_ONLY=false
TODAY_ONLY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--follow)
            FOLLOW=true
            shift
            ;;
        -n|--lines)
            FOLLOW=false
            LINES="$2"
            shift 2
            ;;
        -e|--errors)
            ERRORS_ONLY=true
            FOLLOW=false
            shift
            ;;
        -t|--today)
            TODAY_ONLY=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}[ERROR]${NC} Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Build journalctl command
CMD="journalctl -u $SERVICE_NAME"

if $TODAY_ONLY; then
    CMD="$CMD --since today"
fi

if $ERRORS_ONLY; then
    CMD="$CMD -p err"
fi

if $FOLLOW; then
    echo -e "${BLUE}[INFO]${NC} Following logs for $SERVICE_NAME (Ctrl+C to exit)..."
    echo ""
    $CMD -f
else
    echo -e "${BLUE}[INFO]${NC} Showing last $LINES log entries for $SERVICE_NAME"
    echo ""
    $CMD -n "$LINES" --no-pager
fi

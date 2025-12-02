#!/bin/bash

#===============================================================================
# IPTV Web Player - Auto Installer
# Supports: Debian 11/12/13, Ubuntu 20.04/22.04/24.04
# Note: Use Nginx Proxy Manager for reverse proxy and SSL
#===============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
INSTALL_DIR="/opt/iptv-web-player"
APP_USER="iptv"
NODE_VERSION="20"
DB_NAME="iptv_player"
DB_USER="iptv_user"

# Default ports
SERVER_PORT=3001
MYSQL_PORT=3306

# Fallback ports for API server
SERVER_PORT_FALLBACKS=(3001 3002 3003 3004 3005 8001 8002 8003 8080 9000)

# Generated values
DB_PASSWORD=""
JWT_SECRET=""
MYSQL_ROOT_PASSWORD=""
SERVER_IP=""

#-------------------------------------------------------------------------------
# Helper Functions
#-------------------------------------------------------------------------------

print_banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                                                                  ║"
    echo "║              IPTV Web Player - Auto Installer                    ║"
    echo "║                                                                  ║"
    echo "║     Supports: Debian 11/12/13 | Ubuntu 20.04/22.04/24.04        ║"
    echo "║                                                                  ║"
    echo "║     Note: Configure Nginx Proxy Manager separately              ║"
    echo "║                                                                  ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

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

generate_password() {
    openssl rand -base64 32 | tr -d '/+=' | head -c 24
}

get_server_ip() {
    # Try to get external IP
    SERVER_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || curl -s --max-time 5 icanhazip.com 2>/dev/null || echo "")
    if [ -z "$SERVER_IP" ]; then
        # Fallback to local IP
        SERVER_IP=$(hostname -I | awk '{print $1}')
    fi
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

#-------------------------------------------------------------------------------
# Port Management Functions
#-------------------------------------------------------------------------------

check_port_available() {
    local port=$1
    if command -v ss &> /dev/null; then
        ! ss -tuln | grep -q ":${port} "
    elif command -v netstat &> /dev/null; then
        ! netstat -tuln | grep -q ":${port} "
    else
        return 0
    fi
}

get_port_process() {
    local port=$1
    if command -v ss &> /dev/null; then
        ss -tulnp | grep ":${port} " | awk '{print $NF}' | head -1
    elif command -v netstat &> /dev/null; then
        netstat -tulnp 2>/dev/null | grep ":${port} " | awk '{print $NF}' | head -1
    else
        echo "unknown"
    fi
}

find_available_port() {
    local -n fallbacks=$1
    local selected_port=""

    for port in "${fallbacks[@]}"; do
        if check_port_available "$port"; then
            selected_port=$port
            break
        else
            local process
            process=$(get_port_process "$port")
            log_warn "Port $port is in use by: $process"
        fi
    done

    echo "$selected_port"
}

check_and_configure_ports() {
    log_info "Checking port availability..."
    echo ""

    # Check Server Port (Node.js API)
    log_info "Checking API server port..."
    if check_port_available "$SERVER_PORT"; then
        log_success "Port $SERVER_PORT is available for API server"
    else
        local process
        process=$(get_port_process "$SERVER_PORT")
        log_warn "Default port $SERVER_PORT is in use by: $process"

        SERVER_PORT=$(find_available_port SERVER_PORT_FALLBACKS)
        if [ -z "$SERVER_PORT" ]; then
            log_error "No available port found for API server. Tried: ${SERVER_PORT_FALLBACKS[*]}"
            read -r -p "Enter a custom port for API server: " CUSTOM_PORT
            SERVER_PORT="$CUSTOM_PORT"
            if ! check_port_available "$SERVER_PORT"; then
                log_error "Port $SERVER_PORT is also in use!"
                exit 1
            fi
        else
            log_success "Using fallback port $SERVER_PORT for API server"
        fi
    fi

    # Check MySQL Port
    log_info "Checking MySQL port..."
    if check_port_available "$MYSQL_PORT"; then
        log_success "Port $MYSQL_PORT is available for MySQL"
    else
        local process
        process=$(get_port_process "$MYSQL_PORT")
        if [[ "$process" == *"mysql"* ]] || [[ "$process" == *"mariadbd"* ]]; then
            log_info "MySQL/MariaDB is already running on port $MYSQL_PORT"
        else
            log_warn "Port $MYSQL_PORT is in use by: $process (expected MySQL)"
        fi
    fi

    echo ""
    log_info "Port Configuration:"
    echo "  ├─ API Server: $SERVER_PORT"
    echo "  └─ MySQL:      $MYSQL_PORT"
    echo ""
}

show_listening_ports() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                      LISTENING PORTS                              ${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Table header
    printf "  ${BLUE}%-15s %-10s %-25s %-15s${NC}\n" "SERVICE" "PORT" "ADDRESS" "STATUS"
    echo "  ──────────────────────────────────────────────────────────────────"

    # Node.js API
    if ss -tuln 2>/dev/null | grep -q ":${SERVER_PORT} "; then
        printf "  ${GREEN}%-15s %-10s %-25s %-15s${NC}\n" "Node.js API" "$SERVER_PORT" "0.0.0.0:$SERVER_PORT" "● Active"
    else
        printf "  ${RED}%-15s %-10s %-25s %-15s${NC}\n" "Node.js API" "$SERVER_PORT" "-" "○ Inactive"
    fi

    # MySQL
    if ss -tuln 2>/dev/null | grep -q ":${MYSQL_PORT} "; then
        printf "  ${GREEN}%-15s %-10s %-25s %-15s${NC}\n" "MySQL" "$MYSQL_PORT" "127.0.0.1:$MYSQL_PORT" "● Active"
    else
        printf "  ${RED}%-15s %-10s %-25s %-15s${NC}\n" "MySQL" "$MYSQL_PORT" "-" "○ Inactive"
    fi

    echo ""
    echo -e "  ${CYAN}Network Connections:${NC}"
    echo "  ──────────────────────────────────────────────────────────────────"

    if command -v ss &> /dev/null; then
        ss -tulnp 2>/dev/null | grep -E "(node|mysql)" | head -10 | while read -r line; do
            echo "  $line"
        done
    fi

    echo ""

    # Quick connectivity test
    echo -e "  ${CYAN}Quick Connectivity Test:${NC}"
    echo "  ──────────────────────────────────────────────────────────────────"

    # Test API
    if curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:${SERVER_PORT}/api/health" 2>/dev/null | grep -qE "200|404"; then
        printf "  ${GREEN}✓${NC} API (port $SERVER_PORT): Responding\n"
    else
        printf "  ${YELLOW}!${NC} API (port $SERVER_PORT): Check service status\n"
    fi

    # Test MySQL
    if mysqladmin ping -h 127.0.0.1 -P "${MYSQL_PORT}" --silent 2>/dev/null; then
        printf "  ${GREEN}✓${NC} MySQL (port $MYSQL_PORT): Responding\n"
    else
        printf "  ${YELLOW}!${NC} MySQL (port $MYSQL_PORT): Check service status\n"
    fi

    echo ""
}

#-------------------------------------------------------------------------------
# OS Detection
#-------------------------------------------------------------------------------

detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
        CODENAME=$VERSION_CODENAME
    else
        log_error "Cannot detect OS. /etc/os-release not found."
        exit 1
    fi

    log_info "Detected OS: $OS $VERSION ($CODENAME)"

    case "$OS" in
        debian)
            if [[ "$VERSION" != "11" && "$VERSION" != "12" && "$VERSION" != "13" ]]; then
                log_warn "This script is tested on Debian 11/12/13. Your version: $VERSION"
                read -r -p "Continue anyway? (y/N): " REPLY
                [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
            fi
            ;;
        ubuntu)
            if [[ "$VERSION" != "20.04" && "$VERSION" != "22.04" && "$VERSION" != "24.04" ]]; then
                log_warn "This script is tested on Ubuntu 20.04/22.04/24.04. Your version: $VERSION"
                read -r -p "Continue anyway? (y/N): " REPLY
                [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
            fi
            ;;
        *)
            log_error "Unsupported OS: $OS"
            log_error "This script supports Debian 11/12/13 and Ubuntu 20.04/22.04/24.04"
            exit 1
            ;;
    esac
}

#-------------------------------------------------------------------------------
# User Input
#-------------------------------------------------------------------------------

get_user_input() {
    echo ""
    log_info "Configuration Setup"
    echo "─────────────────────────────────────────────────────────────────────"

    # Get server IP for display
    get_server_ip

    # MySQL Root Password
    echo ""
    read -r -s -p "Enter MySQL root password (leave empty to generate): " MYSQL_ROOT_PASSWORD
    echo
    if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
        MYSQL_ROOT_PASSWORD=$(generate_password)
        log_info "Generated MySQL root password"
    fi

    # Generate secrets
    DB_PASSWORD=$(generate_password)
    JWT_SECRET=$(generate_password)

    echo ""
    log_info "Configuration Summary:"
    echo "  - Server IP: $SERVER_IP"
    echo "  - Install Directory: $INSTALL_DIR"
    echo "  - Database Name: $DB_NAME"
    echo "  - Database User: $DB_USER"
    echo ""
    log_warn "Remember to configure Nginx Proxy Manager after installation!"
    echo ""
    read -r -p "Proceed with installation? (y/N): " REPLY
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1

    log_info "Starting installation process..."
}

#-------------------------------------------------------------------------------
# System Update & Dependencies
#-------------------------------------------------------------------------------

install_dependencies() {
    log_info "Updating system packages..."
    apt-get update -y
    apt-get upgrade -y

    log_info "Installing base dependencies..."
    apt-get install -y \
        curl \
        wget \
        git \
        gnupg \
        ca-certificates \
        apt-transport-https \
        build-essential \
        openssl \
        unzip \
        ffmpeg \
        lsb-release

    log_success "Base dependencies installed"
}

#-------------------------------------------------------------------------------
# Node.js Installation
#-------------------------------------------------------------------------------

install_nodejs() {
    log_info "Installing Node.js $NODE_VERSION..."

    # Remove old NodeSource if exists
    rm -f /etc/apt/sources.list.d/nodesource.list
    rm -f /etc/apt/keyrings/nodesource.gpg

    # Install NodeSource repository
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_VERSION.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list

    apt-get update -y
    apt-get install -y nodejs

    # Verify installation
    NODE_INSTALLED=$(node --version)
    NPM_INSTALLED=$(npm --version)
    log_success "Node.js $NODE_INSTALLED installed (npm $NPM_INSTALLED)"
}

#-------------------------------------------------------------------------------
# MySQL/MariaDB Installation
#-------------------------------------------------------------------------------

install_mysql() {
    log_info "Installing Database Server..."

    # Check if MySQL/MariaDB is already installed
    if command -v mysql &> /dev/null; then
        log_warn "MySQL/MariaDB is already installed"
        return
    fi

    export DEBIAN_FRONTEND=noninteractive

    # Check if mysql-server is actually installable (not just a virtual package)
    if apt-get install --dry-run mysql-server &> /dev/null; then
        log_info "Installing MySQL Server..."
        apt-get install -y mysql-server
        DB_SERVICE="mysql"
    else
        # Fallback to MariaDB (available on Debian by default)
        log_info "MySQL not available, installing MariaDB (MySQL-compatible)..."
        apt-get install -y mariadb-server
        DB_SERVICE="mariadb"
    fi

    # Start and enable database service
    systemctl start "$DB_SERVICE"
    systemctl enable "$DB_SERVICE"

    # Secure installation
    log_info "Securing database installation..."

    # For MariaDB, we need to handle it differently
    if [[ "$DB_SERVICE" == "mariadb" ]]; then
        # MariaDB uses unix_socket auth by default for root
        mysql --user=root <<EOF
ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';
DELETE FROM mysql.user WHERE User='';
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
EOF
    else
        mysql --user=root <<EOF
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASSWORD}';
DELETE FROM mysql.user WHERE User='';
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
EOF
    fi

    log_success "Database server installed and secured ($DB_SERVICE)"
}

#-------------------------------------------------------------------------------
# Database Setup
#-------------------------------------------------------------------------------

setup_database() {
    log_info "Setting up database..."

    mysql --user=root --password="${MYSQL_ROOT_PASSWORD}" <<EOF
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF

    log_success "Database '${DB_NAME}' created with user '${DB_USER}'"
}

#-------------------------------------------------------------------------------
# Create Application User
#-------------------------------------------------------------------------------

create_app_user() {
    log_info "Creating application user '${APP_USER}'..."

    if id "${APP_USER}" &>/dev/null; then
        log_warn "User '${APP_USER}' already exists"
    else
        useradd --system --home-dir ${INSTALL_DIR} --shell /bin/bash ${APP_USER}
        log_success "User '${APP_USER}' created"
    fi
}

#-------------------------------------------------------------------------------
# Application Installation
#-------------------------------------------------------------------------------

install_application() {
    log_info "Installing IPTV Web Player..."

    # Create install directory
    mkdir -p ${INSTALL_DIR}

    # Check if running from source directory or needs to clone
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    if [ -f "${SCRIPT_DIR}/package.json" ]; then
        log_info "Copying from local source..."
        cp -r "${SCRIPT_DIR}"/* ${INSTALL_DIR}/
        rm -rf ${INSTALL_DIR}/node_modules
        rm -rf ${INSTALL_DIR}/client/node_modules
    else
        log_error "Please run this script from the project directory"
        log_error "Or manually copy the project files to ${INSTALL_DIR}"
        exit 1
    fi

    # Create required directories
    mkdir -p ${INSTALL_DIR}/uploads
    mkdir -p ${INSTALL_DIR}/recordings
    mkdir -p ${INSTALL_DIR}/logs

    # Set ownership
    chown -R ${APP_USER}:${APP_USER} ${INSTALL_DIR}

    log_success "Application files copied to ${INSTALL_DIR}"
}

#-------------------------------------------------------------------------------
# Environment Configuration
#-------------------------------------------------------------------------------

configure_environment() {
    log_info "Creating environment configuration..."

    # Use server IP for API URL (user will configure proper domain in Nginx Proxy Manager)
    API_URL="http://${SERVER_IP}:${SERVER_PORT}"
    CLIENT_URL="http://${SERVER_IP}:${SERVER_PORT}"

    cat > ${INSTALL_DIR}/.env <<EOF
# Server
NODE_ENV=production
PORT=${SERVER_PORT}
API_URL=${API_URL}

# Client
CLIENT_URL=${CLIENT_URL}

# MySQL Database
DB_HOST=localhost
DB_PORT=${MYSQL_PORT}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}

# JWT Authentication
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

# Upload Settings
MAX_FILE_SIZE=52428800
UPLOAD_PATH=./uploads

# FFmpeg (for DVR/Recording)
FFMPEG_PATH=/usr/bin/ffmpeg

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# EPG Settings
EPG_UPDATE_INTERVAL=6
PLAYLIST_UPDATE_INTERVAL=24
EOF

    chown ${APP_USER}:${APP_USER} ${INSTALL_DIR}/.env
    chmod 600 ${INSTALL_DIR}/.env

    log_success "Environment configuration created"
}

#-------------------------------------------------------------------------------
# Install NPM Dependencies
#-------------------------------------------------------------------------------

install_npm_dependencies() {
    log_info "Installing NPM dependencies..."

    cd ${INSTALL_DIR}

    # Install backend dependencies
    sudo -u ${APP_USER} npm install --omit=dev

    # Install and build frontend
    cd ${INSTALL_DIR}/client
    sudo -u ${APP_USER} npm install

    # Build frontend
    sudo -u ${APP_USER} npm run build

    log_success "NPM dependencies installed and frontend built"
}

#-------------------------------------------------------------------------------
# Database Migration
#-------------------------------------------------------------------------------

run_migrations() {
    log_info "Running database migrations..."

    cd ${INSTALL_DIR}
    sudo -u ${APP_USER} npm run db:migrate

    log_info "Running database seed..."
    sudo -u ${APP_USER} npm run db:seed

    log_success "Database migrations completed"
}

#-------------------------------------------------------------------------------
# Systemd Service
#-------------------------------------------------------------------------------

create_systemd_service() {
    log_info "Creating systemd service..."

    cat > /etc/systemd/system/iptv-web-player.service <<EOF
[Unit]
Description=IPTV Web Player
Documentation=https://github.com/your-repo/iptv-web-player
After=network.target mysql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=iptv-web-player
Environment=NODE_ENV=production

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${INSTALL_DIR}/uploads ${INSTALL_DIR}/recordings ${INSTALL_DIR}/logs

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable iptv-web-player

    log_success "Systemd service created"
}

#-------------------------------------------------------------------------------
# Firewall Configuration
#-------------------------------------------------------------------------------

configure_firewall() {
    log_info "Configuring firewall..."

    # Check if ufw is installed
    if ! command -v ufw &> /dev/null; then
        apt-get install -y ufw
    fi

    # Allow SSH
    ufw allow ssh

    # Allow API port
    ufw allow "${SERVER_PORT}"/tcp comment 'IPTV API'

    # Enable firewall if not already enabled
    echo "y" | ufw enable

    log_success "Firewall configured (API port: ${SERVER_PORT})"
}

#-------------------------------------------------------------------------------
# Start Services
#-------------------------------------------------------------------------------

start_services() {
    log_info "Starting services..."

    systemctl start iptv-web-player
    sleep 2
    systemctl status iptv-web-player --no-pager || true

    log_success "Services started"
}

#-------------------------------------------------------------------------------
# Print Summary
#-------------------------------------------------------------------------------

print_summary() {
    echo ""
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                                                                  ║"
    echo "║              Installation Complete!                              ║"
    echo "║                                                                  ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # Show listening ports first
    show_listening_ports

    echo -e "${CYAN}Access Information:${NC}"
    echo "  Direct URL: http://${SERVER_IP}:${SERVER_PORT}"
    echo ""
    echo -e "${CYAN}Configured Ports:${NC}"
    echo "  ├─ API Server: ${SERVER_PORT}"
    echo "  └─ MySQL:      ${MYSQL_PORT}"
    echo ""
    echo -e "${CYAN}Default Credentials:${NC}"
    echo "  Admin: admin@iptv.local / admin123"
    echo "  User:  user@iptv.local / user123"
    echo ""
    echo -e "${CYAN}Database:${NC}"
    echo "  Host: localhost"
    echo "  Port: ${MYSQL_PORT}"
    echo "  Name: ${DB_NAME}"
    echo "  User: ${DB_USER}"
    echo "  Password: ${DB_PASSWORD}"
    echo ""
    echo -e "${CYAN}MySQL Root Password:${NC}"
    echo "  ${MYSQL_ROOT_PASSWORD}"
    echo ""
    echo -e "${CYAN}Application Paths:${NC}"
    echo "  Install Dir: ${INSTALL_DIR}"
    echo "  Recordings:  ${INSTALL_DIR}/recordings"
    echo "  Uploads:     ${INSTALL_DIR}/uploads"
    echo "  Logs:        ${INSTALL_DIR}/logs"
    echo "  Frontend:    ${INSTALL_DIR}/client/dist"
    echo ""
    echo -e "${CYAN}Service Management:${NC}"
    echo "  Start:   systemctl start iptv-web-player"
    echo "  Stop:    systemctl stop iptv-web-player"
    echo "  Restart: systemctl restart iptv-web-player"
    echo "  Status:  systemctl status iptv-web-player"
    echo "  Logs:    journalctl -u iptv-web-player -f"
    echo ""
    echo -e "${CYAN}Firewall (UFW):${NC}"
    echo "  Check:   ufw status"
    echo "  Allowed: ${SERVER_PORT}/tcp (API)"
    echo ""

    # Nginx Proxy Manager instructions
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}              NGINX PROXY MANAGER CONFIGURATION                    ${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  To expose the application via Nginx Proxy Manager:"
    echo ""
    echo "  1. Create a new Proxy Host in NPM"
    echo "  2. Configure as follows:"
    echo ""
    echo "     Domain Names:     your-domain.com"
    echo "     Scheme:           http"
    echo "     Forward Hostname: ${SERVER_IP} (or 127.0.0.1 if same server)"
    echo "     Forward Port:     ${SERVER_PORT}"
    echo ""
    echo "  3. In the 'Custom Locations' tab, add:"
    echo ""
    echo "     Location: /recordings"
    echo "     Scheme:   http"
    echo "     Forward:  ${SERVER_IP}:${SERVER_PORT}"
    echo ""
    echo "     Location: /uploads"
    echo "     Scheme:   http"
    echo "     Forward:  ${SERVER_IP}:${SERVER_PORT}"
    echo ""
    echo "  4. Enable SSL in the 'SSL' tab (Let's Encrypt)"
    echo ""
    echo "  5. In 'Advanced' tab, add:"
    echo "     client_max_body_size 100M;"
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Save these credentials in a secure location!${NC}"
    echo ""

    # Save credentials to file
    cat > ${INSTALL_DIR}/INSTALLATION_INFO.txt <<EOF
==============================================
IPTV Web Player - Installation Information
==============================================
Installed: $(date)

Server IP: ${SERVER_IP}
Direct Access: http://${SERVER_IP}:${SERVER_PORT}

Configured Ports:
  API Server: ${SERVER_PORT}
  MySQL:      ${MYSQL_PORT}

Default Login:
  Admin: admin@iptv.local / admin123
  User:  user@iptv.local / user123

Database:
  Host: localhost
  Port: ${MYSQL_PORT}
  Name: ${DB_NAME}
  User: ${DB_USER}
  Password: ${DB_PASSWORD}

MySQL Root Password: ${MYSQL_ROOT_PASSWORD}

JWT Secret: ${JWT_SECRET}

Installation Directory: ${INSTALL_DIR}
Frontend Build: ${INSTALL_DIR}/client/dist

==============================================
NGINX PROXY MANAGER CONFIGURATION
==============================================
Forward Hostname: ${SERVER_IP}
Forward Port: ${SERVER_PORT}
==============================================
EOF
    chmod 600 ${INSTALL_DIR}/INSTALLATION_INFO.txt
    chown root:root ${INSTALL_DIR}/INSTALLATION_INFO.txt

    log_info "Credentials saved to: ${INSTALL_DIR}/INSTALLATION_INFO.txt"
}

#-------------------------------------------------------------------------------
# Main Installation
#-------------------------------------------------------------------------------

main() {
    print_banner
    check_root
    detect_os
    get_user_input
    check_and_configure_ports

    echo ""
    log_info "Starting installation..."
    echo ""

    install_dependencies
    install_nodejs
    install_mysql
    setup_database
    create_app_user
    install_application
    configure_environment
    install_npm_dependencies
    run_migrations
    create_systemd_service
    configure_firewall
    start_services
    print_summary
}

# Run main function
main "$@"

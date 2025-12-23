#!/bin/bash
#===============================================================================
# IPTV Web Player - Backup Script (Linux)
# Faz backup do banco de dados MySQL e arquivos do projeto
#===============================================================================

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configurações
INSTALL_DIR="${INSTALL_DIR:-/opt/iptv-web-player}"
BACKUP_DIR="${BACKUP_DIR:-/opt/iptv-backups}"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# Funções de log
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Verificar se está rodando como root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Por favor, execute como root (sudo)"
        exit 1
    fi
}

# Carregar variáveis do .env
load_env() {
    if [ -f "${INSTALL_DIR}/.env" ]; then
        export $(grep -v '^#' ${INSTALL_DIR}/.env | xargs)
        log_success "Variáveis de ambiente carregadas"
    else
        log_error "Arquivo .env não encontrado em ${INSTALL_DIR}"
        exit 1
    fi
}

# Criar diretório de backup
create_backup_dir() {
    mkdir -p "${BACKUP_DIR}"
    log_success "Diretório de backup: ${BACKUP_DIR}"
}

# Backup apenas do banco de dados
backup_database() {
    log_info "Fazendo backup do banco de dados..."
    
    local DB_BACKUP_FILE="${BACKUP_DIR}/db_${DB_NAME}_${DATE}.sql"
    local DB_BACKUP_COMPRESSED="${BACKUP_DIR}/db_${DB_NAME}_${DATE}.sql.gz"
    
    # Usar mysqldump
    if command -v mysqldump &> /dev/null; then
        mysqldump -h "${DB_HOST}" -P "${DB_PORT:-3306}" -u "${DB_USER}" -p"${DB_PASSWORD}" \
            --single-transaction --routines --triggers --events \
            "${DB_NAME}" > "${DB_BACKUP_FILE}"
        
        # Comprimir
        gzip -f "${DB_BACKUP_FILE}"
        
        log_success "Backup do banco criado: ${DB_BACKUP_COMPRESSED}"
        echo "${DB_BACKUP_COMPRESSED}"
    else
        log_error "mysqldump não encontrado"
        exit 1
    fi
}

# Backup completo (banco + arquivos)
backup_full() {
    log_info "Fazendo backup completo..."
    
    local FULL_BACKUP_DIR="${BACKUP_DIR}/full_${DATE}"
    local FULL_BACKUP_FILE="${BACKUP_DIR}/iptv_backup_full_${DATE}.tar.gz"
    
    mkdir -p "${FULL_BACKUP_DIR}"
    
    # 1. Backup do banco de dados
    log_info "Exportando banco de dados..."
    mysqldump -h "${DB_HOST}" -P "${DB_PORT:-3306}" -u "${DB_USER}" -p"${DB_PASSWORD}" \
        --single-transaction --routines --triggers --events \
        "${DB_NAME}" > "${FULL_BACKUP_DIR}/database.sql"
    
    # 2. Copiar arquivos importantes
    log_info "Copiando arquivos de configuração..."
    cp "${INSTALL_DIR}/.env" "${FULL_BACKUP_DIR}/.env" 2>/dev/null || true
    
    # 3. Copiar uploads (playlists, avatars, EPG)
    if [ -d "${INSTALL_DIR}/uploads" ]; then
        log_info "Copiando uploads..."
        cp -r "${INSTALL_DIR}/uploads" "${FULL_BACKUP_DIR}/uploads"
    fi
    
    # 4. Copiar recordings (se existir e não for muito grande)
    if [ -d "${INSTALL_DIR}/recordings" ]; then
        local RECORDINGS_SIZE=$(du -sm "${INSTALL_DIR}/recordings" 2>/dev/null | cut -f1)
        if [ "${RECORDINGS_SIZE:-0}" -lt 1024 ]; then
            log_info "Copiando recordings (${RECORDINGS_SIZE}MB)..."
            cp -r "${INSTALL_DIR}/recordings" "${FULL_BACKUP_DIR}/recordings"
        else
            log_warn "Recordings muito grande (${RECORDINGS_SIZE}MB), pulando..."
        fi
    fi
    
    # 5. Criar arquivo comprimido
    log_info "Comprimindo backup..."
    tar -czf "${FULL_BACKUP_FILE}" -C "${BACKUP_DIR}" "full_${DATE}"
    
    # 6. Limpar diretório temporário
    rm -rf "${FULL_BACKUP_DIR}"
    
    log_success "Backup completo criado: ${FULL_BACKUP_FILE}"
    echo "${FULL_BACKUP_FILE}"
}

# Limpar backups antigos
cleanup_old_backups() {
    log_info "Limpando backups com mais de ${RETENTION_DAYS} dias..."
    find "${BACKUP_DIR}" -name "*.gz" -type f -mtime +${RETENTION_DAYS} -delete
    find "${BACKUP_DIR}" -name "*.tar.gz" -type f -mtime +${RETENTION_DAYS} -delete
    log_success "Limpeza concluída"
}

# Listar backups existentes
list_backups() {
    log_info "Backups disponíveis em ${BACKUP_DIR}:"
    echo ""
    ls -lh "${BACKUP_DIR}"/*.gz "${BACKUP_DIR}"/*.tar.gz 2>/dev/null || echo "Nenhum backup encontrado"
    echo ""
}

# Menu principal
show_menu() {
    echo ""
    echo "=========================================="
    echo "   IPTV Web Player - Backup Script"
    echo "=========================================="
    echo ""
    echo "1) Backup do banco de dados (comprimido)"
    echo "2) Backup completo (banco + arquivos)"
    echo "3) Listar backups existentes"
    echo "4) Limpar backups antigos"
    echo "0) Sair"
    echo ""
    read -p "Escolha uma opção: " choice
    
    case $choice in
        1)
            load_env
            backup_database
            ;;
        2)
            load_env
            backup_full
            ;;
        3)
            list_backups
            ;;
        4)
            cleanup_old_backups
            ;;
        0)
            exit 0
            ;;
        *)
            log_error "Opção inválida"
            ;;
    esac
}

# Execução
check_root
create_backup_dir

# Se passou argumentos, executar diretamente
case "${1:-}" in
    --db|--database)
        load_env
        backup_database
        ;;
    --full)
        load_env
        backup_full
        ;;
    --list)
        list_backups
        ;;
    --cleanup)
        cleanup_old_backups
        ;;
    --help|-h)
        echo "Uso: $0 [opção]"
        echo ""
        echo "Opções:"
        echo "  --db, --database    Backup apenas do banco de dados"
        echo "  --full              Backup completo (banco + arquivos)"
        echo "  --list              Listar backups existentes"
        echo "  --cleanup           Limpar backups antigos"
        echo "  --help, -h          Mostrar esta ajuda"
        echo ""
        echo "Sem argumentos, abre menu interativo."
        ;;
    *)
        show_menu
        ;;
esac

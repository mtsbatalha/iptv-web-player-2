#!/bin/bash
#===============================================================================
# IPTV Web Player - Restore Script (Linux)
# Restaura backup do banco de dados MySQL e arquivos do projeto
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
        log_warn "Você precisará fornecer as credenciais manualmente"
        read -p "DB_HOST: " DB_HOST
        read -p "DB_PORT [3306]: " DB_PORT
        DB_PORT=${DB_PORT:-3306}
        read -p "DB_USER: " DB_USER
        read -sp "DB_PASSWORD: " DB_PASSWORD
        echo ""
        read -p "DB_NAME: " DB_NAME
    fi
}

# Listar backups disponíveis
list_backups() {
    echo ""
    log_info "Backups disponíveis:"
    echo ""
    
    local i=1
    BACKUP_FILES=()
    
    # Listar arquivos de backup
    for file in "${BACKUP_DIR}"/*.sql.gz "${BACKUP_DIR}"/*.tar.gz; do
        if [ -f "$file" ]; then
            BACKUP_FILES+=("$file")
            local size=$(du -h "$file" | cut -f1)
            local date=$(stat -c %y "$file" 2>/dev/null | cut -d' ' -f1 || stat -f %Sm "$file" 2>/dev/null)
            echo "  $i) $(basename "$file") ($size) - $date"
            ((i++))
        fi
    done
    
    if [ ${#BACKUP_FILES[@]} -eq 0 ]; then
        log_warn "Nenhum backup encontrado em ${BACKUP_DIR}"
        return 1
    fi
    
    echo ""
}

# Restaurar apenas banco de dados
restore_database() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        log_error "Arquivo de backup não especificado"
        exit 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "Arquivo não encontrado: $backup_file"
        exit 1
    fi
    
    log_warn "ATENÇÃO: Esta operação irá SUBSTITUIR todos os dados do banco ${DB_NAME}"
    read -p "Deseja continuar? (digite 'sim' para confirmar): " confirm
    
    if [ "$confirm" != "sim" ]; then
        log_info "Operação cancelada"
        exit 0
    fi
    
    # Parar o serviço
    log_info "Parando serviço..."
    systemctl stop iptv-web-player 2>/dev/null || true
    
    log_info "Restaurando banco de dados..."
    
    if [[ "$backup_file" == *.gz ]]; then
        # Arquivo comprimido
        gunzip -c "$backup_file" | mysql -h "${DB_HOST}" -P "${DB_PORT:-3306}" -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}"
    else
        # Arquivo SQL puro
        mysql -h "${DB_HOST}" -P "${DB_PORT:-3306}" -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" < "$backup_file"
    fi
    
    # Reiniciar o serviço
    log_info "Reiniciando serviço..."
    systemctl start iptv-web-player 2>/dev/null || true
    
    log_success "Banco de dados restaurado com sucesso!"
}

# Restaurar backup completo
restore_full() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        log_error "Arquivo de backup não especificado"
        exit 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "Arquivo não encontrado: $backup_file"
        exit 1
    fi
    
    if [[ "$backup_file" != *.tar.gz ]]; then
        log_error "Para restauração completa, use um arquivo .tar.gz"
        exit 1
    fi
    
    log_warn "ATENÇÃO: Esta operação irá SUBSTITUIR:"
    log_warn "  - Todos os dados do banco ${DB_NAME}"
    log_warn "  - Arquivos de upload (playlists, avatars, EPG)"
    log_warn "  - Recordings (se incluídos no backup)"
    echo ""
    read -p "Deseja continuar? (digite 'sim' para confirmar): " confirm
    
    if [ "$confirm" != "sim" ]; then
        log_info "Operação cancelada"
        exit 0
    fi
    
    # Parar o serviço
    log_info "Parando serviço..."
    systemctl stop iptv-web-player 2>/dev/null || true
    
    # Criar diretório temporário
    local TEMP_DIR=$(mktemp -d)
    log_info "Extraindo backup..."
    tar -xzf "$backup_file" -C "$TEMP_DIR"
    
    # Encontrar o diretório extraído
    local EXTRACTED_DIR=$(ls -d ${TEMP_DIR}/*/ 2>/dev/null | head -1)
    
    if [ -z "$EXTRACTED_DIR" ]; then
        log_error "Erro ao extrair backup"
        rm -rf "$TEMP_DIR"
        exit 1
    fi
    
    # 1. Restaurar banco de dados
    if [ -f "${EXTRACTED_DIR}/database.sql" ]; then
        log_info "Restaurando banco de dados..."
        mysql -h "${DB_HOST}" -P "${DB_PORT:-3306}" -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" < "${EXTRACTED_DIR}/database.sql"
        log_success "Banco de dados restaurado"
    fi
    
    # 2. Restaurar uploads
    if [ -d "${EXTRACTED_DIR}/uploads" ]; then
        log_info "Restaurando uploads..."
        rm -rf "${INSTALL_DIR}/uploads"
        cp -r "${EXTRACTED_DIR}/uploads" "${INSTALL_DIR}/uploads"
        chown -R root:root "${INSTALL_DIR}/uploads"
        chmod -R 777 "${INSTALL_DIR}/uploads"
        log_success "Uploads restaurados"
    fi
    
    # 3. Restaurar recordings
    if [ -d "${EXTRACTED_DIR}/recordings" ]; then
        log_info "Restaurando recordings..."
        rm -rf "${INSTALL_DIR}/recordings"
        cp -r "${EXTRACTED_DIR}/recordings" "${INSTALL_DIR}/recordings"
        chown -R root:root "${INSTALL_DIR}/recordings"
        chmod -R 777 "${INSTALL_DIR}/recordings"
        log_success "Recordings restaurados"
    fi
    
    # 4. Restaurar .env (opcional)
    if [ -f "${EXTRACTED_DIR}/.env" ]; then
        read -p "Restaurar arquivo .env? (s/n): " restore_env
        if [ "$restore_env" = "s" ]; then
            cp "${EXTRACTED_DIR}/.env" "${INSTALL_DIR}/.env"
            chmod 644 "${INSTALL_DIR}/.env"
            log_success ".env restaurado"
        fi
    fi
    
    # Limpar
    rm -rf "$TEMP_DIR"
    
    # Reiniciar o serviço
    log_info "Reiniciando serviço..."
    systemctl start iptv-web-player 2>/dev/null || true
    
    log_success "Restauração completa concluída!"
}

# Menu interativo
select_backup() {
    list_backups || return 1
    
    read -p "Selecione o número do backup (0 para cancelar): " selection
    
    if [ "$selection" = "0" ]; then
        exit 0
    fi
    
    local index=$((selection - 1))
    
    if [ $index -ge 0 ] && [ $index -lt ${#BACKUP_FILES[@]} ]; then
        SELECTED_BACKUP="${BACKUP_FILES[$index]}"
        echo ""
        log_info "Selecionado: $(basename "$SELECTED_BACKUP")"
    else
        log_error "Seleção inválida"
        exit 1
    fi
}

# Menu principal
show_menu() {
    echo ""
    echo "=========================================="
    echo "   IPTV Web Player - Restore Script"
    echo "=========================================="
    echo ""
    echo "1) Restaurar banco de dados (.sql.gz)"
    echo "2) Restaurar backup completo (.tar.gz)"
    echo "3) Listar backups disponíveis"
    echo "0) Sair"
    echo ""
    read -p "Escolha uma opção: " choice
    
    case $choice in
        1)
            load_env
            select_backup
            restore_database "$SELECTED_BACKUP"
            ;;
        2)
            load_env
            select_backup
            restore_full "$SELECTED_BACKUP"
            ;;
        3)
            list_backups
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

# Se passou argumentos, executar diretamente
case "${1:-}" in
    --db|--database)
        load_env
        restore_database "$2"
        ;;
    --full)
        load_env
        restore_full "$2"
        ;;
    --list)
        list_backups
        ;;
    --help|-h)
        echo "Uso: $0 [opção] [arquivo]"
        echo ""
        echo "Opções:"
        echo "  --db, --database <arquivo>   Restaurar apenas banco de dados"
        echo "  --full <arquivo>             Restaurar backup completo"
        echo "  --list                       Listar backups disponíveis"
        echo "  --help, -h                   Mostrar esta ajuda"
        echo ""
        echo "Sem argumentos, abre menu interativo."
        ;;
    *)
        show_menu
        ;;
esac

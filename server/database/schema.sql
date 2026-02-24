-- =====================================================
-- IPTV Web Player - Schema do Banco de Dados
-- MySQL 8.x
-- Para hospedagem compartilhada (banco já existe)
-- =====================================================

-- Garantir charset utf8mb4 para suporte a caracteres especiais
-- (grego, árabe, emojis, etc.)
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- =====================================================
-- TABELAS DE USUÁRIOS E AUTENTICAÇÃO
-- =====================================================

-- Planos de assinatura
CREATE TABLE IF NOT EXISTS plans (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    max_playlists INT DEFAULT 5,
    max_channels INT DEFAULT 500,
    max_favorites INT DEFAULT 100,
    max_recordings INT DEFAULT 10,
    max_recording_hours INT DEFAULT 24,
    can_use_epg BOOLEAN DEFAULT TRUE,
    can_use_dvr BOOLEAN DEFAULT FALSE,
    price DECIMAL(10, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usuários
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url VARCHAR(500),
    role ENUM('user', 'moderator', 'admin', 'superadmin') DEFAULT 'user',
    plan_id INT DEFAULT 1,
    status ENUM('active', 'inactive', 'suspended', 'pending') DEFAULT 'pending',
    email_verified_at TIMESTAMP NULL,
    last_login_at TIMESTAMP NULL,
    login_count INT DEFAULT 0,
    preferences JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tokens de refresh
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token VARCHAR(500) NOT NULL UNIQUE,
    device_info VARCHAR(500),
    ip_address VARCHAR(45),
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessões de usuário
CREATE TABLE IF NOT EXISTS user_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    device_type ENUM('desktop', 'tablet', 'mobile', 'tv', 'unknown') DEFAULT 'unknown',
    device_name VARCHAR(255),
    browser VARCHAR(100),
    os VARCHAR(100),
    ip_address VARCHAR(45),
    is_active BOOLEAN DEFAULT TRUE,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABELAS DE PLAYLISTS E CANAIS
-- =====================================================

-- Playlists (listas M3U)
CREATE TABLE IF NOT EXISTS playlists (
    id INT PRIMARY KEY AUTO_INCREMENT,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    source_type ENUM('url', 'file') NOT NULL,
    source_url VARCHAR(2000),
    file_path VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    auto_update BOOLEAN DEFAULT TRUE,
    update_interval INT DEFAULT 24, -- em horas
    last_updated_at TIMESTAMP NULL,
    last_sync_at TIMESTAMP NULL,
    sync_status ENUM('pending', 'syncing', 'success', 'error') DEFAULT 'pending',
    sync_error TEXT,
    channel_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Categorias de canais
CREATE TABLE IF NOT EXISTS categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    playlist_id INT,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    icon VARCHAR(500),
    color VARCHAR(7),
    order_index INT DEFAULT 0,
    is_custom BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Canais
CREATE TABLE IF NOT EXISTS channels (
    id INT PRIMARY KEY AUTO_INCREMENT,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    playlist_id INT NOT NULL,
    category_id INT,
    epg_channel_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    stream_url VARCHAR(2000) NOT NULL,
    logo_url VARCHAR(1000),
    tvg_id VARCHAR(255),
    tvg_name VARCHAR(255),
    tvg_logo VARCHAR(1000),
    group_title VARCHAR(255),
    language VARCHAR(50),
    country VARCHAR(100),
    stream_type ENUM('live', 'vod', 'series', 'radio') DEFAULT 'live',
    is_active BOOLEAN DEFAULT TRUE,
    is_adult BOOLEAN DEFAULT FALSE,
    quality VARCHAR(50),
    order_index INT DEFAULT 0,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índice para busca de canais
CREATE INDEX idx_channels_name ON channels(name);
CREATE INDEX idx_channels_tvg_id ON channels(tvg_id);
CREATE INDEX idx_channels_group ON channels(group_title);

-- =====================================================
-- TABELAS DE EPG (Electronic Program Guide)
-- =====================================================

-- Fontes de EPG
CREATE TABLE IF NOT EXISTS epg_sources (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(2000) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    auto_update BOOLEAN DEFAULT TRUE,
    update_interval INT DEFAULT 6, -- em horas
    last_updated_at TIMESTAMP NULL,
    sync_status ENUM('pending', 'syncing', 'success', 'error') DEFAULT 'pending',
    sync_error TEXT,
    program_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Canais EPG (metadados do XMLTV)
CREATE TABLE IF NOT EXISTS epg_channels (
    id INT PRIMARY KEY AUTO_INCREMENT,
    epg_source_id INT NOT NULL,
    channel_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    icon_url VARCHAR(1000),
    language VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (epg_source_id) REFERENCES epg_sources(id) ON DELETE CASCADE,
    UNIQUE KEY unique_channel_source (epg_source_id, channel_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Programas EPG
CREATE TABLE IF NOT EXISTS epg_programs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    epg_channel_id INT NOT NULL,
    title VARCHAR(500) NOT NULL,
    subtitle VARCHAR(500),
    description TEXT,
    category VARCHAR(255),
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    duration INT, -- em minutos
    episode_num VARCHAR(50),
    season_num VARCHAR(50),
    year VARCHAR(10),
    rating VARCHAR(50),
    icon_url VARCHAR(1000),
    is_live BOOLEAN DEFAULT FALSE,
    is_new BOOLEAN DEFAULT FALSE,
    is_premiere BOOLEAN DEFAULT FALSE,
    language VARCHAR(50),
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (epg_channel_id) REFERENCES epg_channels(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices para EPG
CREATE INDEX idx_epg_programs_times ON epg_programs(start_time, end_time);
CREATE INDEX idx_epg_programs_channel ON epg_programs(epg_channel_id, start_time);

-- Mapeamento Canal <-> EPG
CREATE TABLE IF NOT EXISTS channel_epg_mapping (
    id INT PRIMARY KEY AUTO_INCREMENT,
    channel_id INT NOT NULL,
    epg_channel_id INT NOT NULL,
    is_auto_mapped BOOLEAN DEFAULT FALSE,
    confidence_score DECIMAL(3, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (epg_channel_id) REFERENCES epg_channels(id) ON DELETE CASCADE,
    UNIQUE KEY unique_mapping (channel_id, epg_channel_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABELAS DE FAVORITOS E HISTÓRICO
-- =====================================================

-- Favoritos
CREATE TABLE IF NOT EXISTS favorites (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    channel_id INT NOT NULL,
    order_index INT DEFAULT 0,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    UNIQUE KEY unique_favorite (user_id, channel_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Histórico de visualização
CREATE TABLE IF NOT EXISTS watch_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    channel_id INT NOT NULL,
    watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration INT DEFAULT 0, -- em segundos
    device_type VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índice para histórico
CREATE INDEX idx_watch_history_user ON watch_history(user_id, watched_at DESC);

-- =====================================================
-- TABELAS DE DVR / GRAVAÇÕES
-- =====================================================

-- Gravações
CREATE TABLE IF NOT EXISTS recordings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    channel_id INT NOT NULL,
    epg_program_id INT,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status ENUM('scheduled', 'recording', 'completed', 'failed', 'cancelled') DEFAULT 'scheduled',
    recording_type ENUM('manual', 'scheduled', 'series') DEFAULT 'manual',
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    actual_start_time DATETIME,
    actual_end_time DATETIME,
    duration INT, -- em segundos
    file_path VARCHAR(500),
    file_size BIGINT DEFAULT 0,
    format VARCHAR(20) DEFAULT 'ts',
    quality VARCHAR(50),
    error_message TEXT,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (epg_program_id) REFERENCES epg_programs(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índice para gravações
CREATE INDEX idx_recordings_user ON recordings(user_id, status);
CREATE INDEX idx_recordings_time ON recordings(start_time, end_time);

-- =====================================================
-- TABELAS DE LOGS E MÉTRICAS
-- =====================================================

-- Logs de atividade
CREATE TABLE IF NOT EXISTS activity_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INT,
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Métricas de streaming
CREATE TABLE IF NOT EXISTS streaming_metrics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    channel_id INT NOT NULL,
    session_id VARCHAR(100),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NULL,
    duration INT DEFAULT 0,
    bytes_transferred BIGINT DEFAULT 0,
    quality VARCHAR(50),
    buffer_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    device_type VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Logs de sistema
CREATE TABLE IF NOT EXISTS system_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    level ENUM('debug', 'info', 'warning', 'error', 'critical') DEFAULT 'info',
    component VARCHAR(100),
    message TEXT NOT NULL,
    context JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABELAS DE CONFIGURAÇÕES
-- =====================================================

-- Configurações do sistema
CREATE TABLE IF NOT EXISTS settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    `key` VARCHAR(255) NOT NULL UNIQUE,
    value TEXT,
    type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Configurações por usuário
CREATE TABLE IF NOT EXISTS user_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    `key` VARCHAR(255) NOT NULL,
    value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_setting (user_id, `key`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- DADOS INICIAIS
-- =====================================================

-- Planos padrão
INSERT INTO plans (name, slug, description, max_playlists, max_channels, max_favorites, max_recordings, max_recording_hours, can_use_epg, can_use_dvr, price) VALUES
('Free', 'free', 'Plano gratuito com recursos básicos', 2, 100, 20, 0, 0, TRUE, FALSE, 0.00),
('Basic', 'basic', 'Plano básico para uso pessoal', 5, 500, 100, 5, 12, TRUE, TRUE, 9.90),
('Premium', 'premium', 'Plano premium com todos os recursos', 20, 2000, 500, 50, 168, TRUE, TRUE, 19.90),
('Enterprise', 'enterprise', 'Plano empresarial ilimitado', -1, -1, -1, -1, -1, TRUE, TRUE, 49.90);

-- Configurações padrão do sistema
INSERT INTO settings (`key`, value, type, description, is_public) VALUES
('site_name', 'IPTV Player', 'string', 'Nome do site', TRUE),
('site_description', 'Sistema de gerenciamento e reprodução de IPTV', 'string', 'Descrição do site', TRUE),
('allow_registration', 'true', 'boolean', 'Permitir novos cadastros', FALSE),
('default_plan_id', '1', 'number', 'Plano padrão para novos usuários', FALSE),
('max_login_attempts', '5', 'number', 'Máximo de tentativas de login', FALSE),
('lockout_duration', '15', 'number', 'Duração do bloqueio em minutos', FALSE),
('session_lifetime', '1440', 'number', 'Duração da sessão em minutos', FALSE),
('enable_epg', 'true', 'boolean', 'Habilitar EPG global', FALSE),
('enable_dvr', 'true', 'boolean', 'Habilitar DVR global', FALSE);

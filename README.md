# IPTV Web Player

Sistema completo de gerenciamento e reprodução de IPTV, desenvolvido para ambiente de hospedagem compartilhada com DirectAdmin + MySQL.

---

## Funcionalidades

### Usuários e Autenticação
- Cadastro e login com JWT (access + refresh tokens)
- Múltiplos papéis: `user`, `moderator`, `admin`, `superadmin`
- Planos com limites configuráveis (canais, gravações, etc.)
- Gestão de sessões e dispositivos

### Playlists IPTV
- Importação por URL (M3U/M3U8) ou upload de arquivo
- Parser inteligente com detecção de categorias e extração de EPG do header
- Atualização automática configurável (intervalo por playlist)
- Sincronização manual com bulk insert e controle de timeout

### Canais
- Listagem com filtros, busca e categorização automática
- Favoritos e histórico de visualização com tracking de duração
- Player HLS integrado (HLS.js + mpegts.js)
- Mini player flutuante

### EPG (Electronic Program Guide)
- Importação de fontes XMLTV
- Grade de programação com programa atual e próximo
- Mapeamento automático canal/EPG

### DVR / Gravações
- Gravação agendada, imediata e em série
- Processamento via FFmpeg
- Limites por plano de assinatura

### Painel Administrativo
- Dashboard com estatísticas do sistema
- Gestão de usuários e planos
- Logs de atividade e sistema (info, warning, error, critical)
- Configurações globais

---

## Tecnologias

### Backend

| Tecnologia | Uso |
|---|---|
| **Node.js** | Runtime do servidor |
| **Express 4** | Framework HTTP |
| **MySQL 8.x** | Banco de dados (utf8mb4) |
| **mysql2** | Driver MySQL com pool de conexões (promises) |
| **JWT** (`jsonwebtoken`) | Autenticação com access/refresh tokens |
| **bcryptjs** | Hash de senhas (12 rounds) |
| **Helmet** | Headers de segurança HTTP |
| **CORS** | Controle de acesso cross-origin |
| **express-rate-limit** | Limitação de requisições |
| **express-validator** | Validação de entrada |
| **Multer** | Upload de arquivos |
| **Axios** | Requisições HTTP (download de playlists/EPG) |
| **xml2js** | Parser XMLTV para EPG |
| **node-cron** | Jobs agendados (atualização automática) |
| **fluent-ffmpeg** | DVR/gravações de vídeo |
| **Morgan** | Logging de requisições HTTP |
| **compression** | Compressão gzip de respostas |
| **UUID** | Geração de IDs únicos |
| **dotenv** | Variáveis de ambiente |
| **nodemon** | Hot-reload em desenvolvimento |
| **concurrently** | Execução paralela de backend + frontend |

### Frontend

| Tecnologia | Uso |
|---|---|
| **React 18** | Framework UI |
| **Vite 5** | Build tool e dev server |
| **TailwindCSS 3** | Estilização utility-first com dark mode |
| **Zustand** | Gerenciamento de estado (authStore, playerStore) |
| **React Router 6** | Roteamento SPA |
| **HLS.js** | Reprodução de streams HLS |
| **mpegts.js** | Reprodução de streams MPEG-TS |
| **Axios** | Requisições HTTP com interceptors JWT |
| **react-hot-toast** | Notificações toast |
| **react-icons** | Biblioteca de ícones |
| **date-fns** | Manipulação de datas |
| **clsx** | Composição condicional de classes CSS |
| **PostCSS + Autoprefixer** | Processamento CSS |

---

## Estrutura do Projeto

```
iptv-web-player/
├── server/                         # Backend Node.js/Express
│   ├── index.js                    # Entry point do servidor
│   ├── database/
│   │   ├── connection.js           # Pool de conexões MySQL
│   │   ├── migrate.js              # Script de migração (schema)
│   │   ├── schema.sql              # Schema completo do banco
│   │   └── seed.js                 # Dados iniciais (admin, planos)
│   ├── middleware/
│   │   ├── auth.js                 # Validação JWT e controle de acesso
│   │   ├── errorHandler.js         # Tratamento global de erros
│   │   ├── logger.js               # Logging de atividade
│   │   ├── upload.js               # Configuração do Multer
│   │   └── validators.js           # Regras de validação
│   ├── routes/
│   │   ├── admin.js                # Rotas administrativas
│   │   ├── auth.js                 # Autenticação (login, register, refresh)
│   │   ├── categories.js           # Categorias de canais
│   │   ├── channels.js             # Canais IPTV
│   │   ├── epg.js                  # Electronic Program Guide
│   │   ├── favorites.js            # Favoritos do usuário
│   │   ├── history.js              # Histórico de visualização
│   │   ├── playlists.js            # Gestão de playlists M3U
│   │   ├── recordings.js           # DVR/Gravações
│   │   ├── settings.js             # Configurações
│   │   ├── stream.js               # Streaming e tokens de playback
│   │   └── users.js                # Perfil e configurações do usuário
│   ├── services/
│   │   ├── m3uParser.js            # Parser de playlists M3U/M3U8
│   │   ├── epgParser.js            # Parser de EPG XMLTV
│   │   ├── recorder.js             # Gravação via FFmpeg
│   │   └── streamManager.js        # Gestão de streams
│   └── jobs/
│       └── scheduler.js            # Jobs agendados (cron)
├── client/                         # Frontend React/Vite
│   ├── index.html                  # HTML entry point
│   ├── package.json                # Dependências do frontend
│   ├── vite.config.js              # Configuração Vite + proxy
│   ├── tailwind.config.js          # Configuração TailwindCSS
│   ├── postcss.config.js           # Configuração PostCSS
│   └── src/
│       ├── main.jsx                # Entry point React
│       ├── App.jsx                 # Componente raiz + rotas
│       ├── components/
│       │   ├── VideoPlayer.jsx     # Player de vídeo HLS/MPEG-TS
│       │   ├── MiniPlayer.jsx      # Mini player flutuante
│       │   └── RecordingControls.jsx # Controles de gravação
│       ├── layouts/
│       │   ├── MainLayout.jsx      # Layout principal
│       │   ├── AdminLayout.jsx     # Layout do painel admin
│       │   └── AuthLayout.jsx      # Layout de autenticação
│       ├── pages/
│       │   ├── admin/              # Páginas administrativas
│       │   ├── auth/               # Login, registro
│       │   ├── Channels.jsx        # Listagem de canais
│       │   ├── ChannelPlayer.jsx   # Player de canal
│       │   └── Dashboard.jsx       # Dashboard
│       ├── stores/
│       │   ├── authStore.js        # Estado de autenticação (Zustand)
│       │   └── playerStore.js      # Estado do player (Zustand)
│       ├── services/
│       │   └── api.js              # Cliente Axios com interceptors
│       └── hooks/
│           └── useRecording.js     # Hook de gravação
├── scripts/                        # Scripts de manutenção
│   ├── linux/                      # Scripts para Linux
│   │   ├── install.sh              # Instalação automática completa
│   │   ├── uninstall.sh            # Remoção da instalação
│   │   ├── update.sh               # Atualização da aplicação
│   │   ├── start.sh                # Iniciar serviço
│   │   ├── stop.sh                 # Parar serviço
│   │   ├── restart.sh              # Reiniciar serviço
│   │   ├── status.sh               # Status detalhado
│   │   ├── logs.sh                 # Visualizar logs
│   │   ├── rebuild-frontend.sh     # Reconstruir frontend
│   │   ├── backup.sh               # Backup do banco e arquivos
│   │   ├── restore.sh              # Restaurar backup
│   │   ├── fix-stuck-playlists.sql # Fix playlists travadas
│   │   └── fix-charset-utf8mb4.sql # Migração de charset
│   └── windows/                    # Scripts para Windows
│       ├── start.bat               # Iniciar aplicação
│       ├── stop.bat                # Parar aplicação
│       ├── restart.bat             # Reiniciar aplicação
│       ├── status.bat              # Status detalhado
│       ├── rebuild-frontend.bat    # Reconstruir frontend
│       ├── backup.ps1              # Backup (PowerShell)
│       └── restore.ps1             # Restore (PowerShell)
├── uploads/                        # Arquivos enviados (playlists M3U, avatars)
├── recordings/                     # Gravações DVR (arquivos MP4)
├── package.json                    # Dependências do backend
├── .env                            # Configuração (não versionado)
└── .env.example                    # Exemplo de configuração
```

---

## Diretórios de Dados

| Diretório | Descrição |
|---|---|
| `uploads/` | Arquivos de playlist M3U enviados por upload, avatares de usuários |
| `recordings/` | Gravações DVR em formato MP4 geradas pelo FFmpeg |
| `client/dist/` | Build de produção do frontend (gerado por `npm run build`) |
| `node_modules/` | Dependências do backend |
| `client/node_modules/` | Dependências do frontend |

Logs do sistema são armazenados na tabela `system_logs` do banco de dados (em produção Linux, também via `journalctl`).

---

## Dependências

### Requisitos do Sistema

| Requisito | Versão Mínima | Nota |
|---|---|---|
| **Node.js** | 18+ | Runtime JavaScript |
| **npm** | 9+ | Gerenciador de pacotes |
| **MySQL** | 8.x | Ou MariaDB 10.x+ |
| **FFmpeg** | qualquer | Necessário apenas para DVR/gravações |

### Instalar Dependências do Projeto

```bash
# Backend (na raiz do projeto)
npm install

# Frontend
cd client && npm install
```

---

## Arquitetura

### Visão Geral

```
┌─────────────────────────────────────────────────────────────┐
│                        Cliente                              │
│  React 18 + Vite + TailwindCSS + Zustand                   │
│  Porta: 5173 (dev) ou servido pelo Express (produção)       │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/REST (JSON)
                           │ Proxy: /api → :3001
┌──────────────────────────▼──────────────────────────────────┐
│                     Servidor Express                        │
│  Porta: 3001                                                │
│  ┌────────────┐ ┌────────────┐ ┌──────────────────────────┐ │
│  │ Middleware  │ │   Routes   │ │       Services           │ │
│  │ - Auth JWT │ │ - /auth    │ │ - M3U Parser             │ │
│  │ - Helmet   │ │ - /channels│ │ - EPG Parser (XMLTV)     │ │
│  │ - CORS     │ │ - /epg     │ │ - Recorder (FFmpeg)      │ │
│  │ - Rate Lim │ │ - /playlist│ │ - Stream Manager         │ │
│  │ - Validator│ │ - /admin   │ │                          │ │
│  │ - Logger   │ │ - /stream  │ │                          │ │
│  └────────────┘ └────────────┘ └──────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                  Jobs (node-cron)                      │  │
│  │  - Auto-update playlists (a cada hora)                │  │
│  │  - Auto-update EPG (a cada 6 horas)                   │  │
│  │  - Reset playlists/EPG travadas (a cada 15 min)       │  │
│  │  - Limpeza de gravações e sessões                     │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    MySQL 8.x (utf8mb4)                      │
│  20+ tabelas: users, playlists, channels, categories,       │
│  epg_sources, epg_programs, favorites, watch_history,       │
│  recordings, activity_logs, system_logs, settings...        │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo de Autenticação

```
Cliente                     Servidor                    Banco
  │                            │                          │
  │── POST /api/auth/login ───>│                          │
  │                            │── Verifica credenciais ─>│
  │                            │<── Usuário encontrado ───│
  │                            │── Gera access + refresh  │
  │<── { accessToken,         │   tokens (JWT)            │
  │      refreshToken } ──────│                          │
  │                            │                          │
  │── GET /api/channels ──────>│                          │
  │   (Authorization: Bearer)  │── Valida JWT ──────────>│
  │<── Lista de canais ───────│<── Dados ────────────────│
  │                            │                          │
  │── POST /api/auth/refresh ─>│                          │
  │   (refreshToken expirado)  │── Rotaciona refresh ───>│
  │<── Novos tokens ──────────│                          │
```

### Segurança

- **Rate limiting**: 100 req/15 min global + limites mais rigorosos em `/auth`
- **JWT**: Access tokens (7d) + refresh token rotation
- **Bcryptjs**: Hash de senhas com 12 rounds
- **Helmet**: Headers HTTP de segurança
- **CORS**: Origens específicas configuráveis
- **express-validator**: Validação e sanitização de todas as entradas
- **RBAC**: Controle de acesso baseado em papéis (user/moderator/admin/superadmin)
- **Audit trail**: Logs de atividade em `activity_logs`

---

## Instalação

### Instalação Automática (Linux - Recomendado)

Para Debian 11/12/13 ou Ubuntu 20.04/22.04/24.04:

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/iptv-web-player.git
cd iptv-web-player

# Execute o instalador como root
sudo chmod +x scripts/linux/install.sh
sudo ./scripts/linux/install.sh
```

O instalador irá:
- Detectar automaticamente seu sistema operacional
- Instalar todas as dependências (Node.js, MySQL/MariaDB, FFmpeg)
- Configurar o banco de dados (migrate + seed)
- Criar serviço systemd para auto-start
- Configurar firewall (UFW)

> Use **Nginx Proxy Manager** para configurar reverse proxy e SSL.

### Instalação Manual (Linux/macOS/Windows)

#### 1. Pré-requisitos

Instale manualmente: Node.js 18+, MySQL 8.x e FFmpeg (opcional, para DVR).

#### 2. Clone e configure

```bash
git clone https://github.com/seu-usuario/iptv-web-player.git
cd iptv-web-player
cp .env.example .env
```

Edite o `.env` com suas configurações:

```env
# Servidor
NODE_ENV=development
PORT=3001
API_URL=http://localhost:3001
CLIENT_URL=http://localhost:5173

# Banco de Dados MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=iptv_player

# JWT - use uma chave segura e longa
JWT_SECRET=sua_chave_secreta_muito_segura_aqui
JWT_EXPIRES_IN=7d

# Upload
MAX_FILE_SIZE=52428800
UPLOAD_PATH=./uploads

# FFmpeg (caminho no Linux; no Windows use C:/ffmpeg/bin/ffmpeg.exe)
FFMPEG_PATH=/usr/bin/ffmpeg

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Intervalos de atualização automática (em horas)
EPG_UPDATE_INTERVAL=6
PLAYLIST_UPDATE_INTERVAL=24
```

#### 3. Instale as dependências

```bash
# Backend
npm install

# Frontend
cd client && npm install && cd ..
```

#### 4. Configure o banco de dados

```bash
# Criar tabelas
npm run db:migrate

# Inserir dados iniciais (admin, planos padrão)
npm run db:seed
```

#### 5. Inicie a aplicação

```bash
# Desenvolvimento (backend + frontend com hot-reload)
npm run dev

# Produção (build do frontend + servidor)
npm run build
npm start
```

---

## Inicialização / Parada / Restart

### Linux (com systemd - após install.sh)

```bash
sudo ./scripts/linux/start.sh       # Iniciar serviço
sudo ./scripts/linux/stop.sh        # Parar serviço
sudo ./scripts/linux/restart.sh     # Reiniciar serviço
```

Ou diretamente via systemctl:

```bash
sudo systemctl start iptv-web-player
sudo systemctl stop iptv-web-player
sudo systemctl restart iptv-web-player
```

### Windows

```batch
.\scripts\windows\start.bat             :: Iniciar (modo desenvolvimento)
.\scripts\windows\start.bat --prod      :: Iniciar (modo produção)
.\scripts\windows\stop.bat              :: Parar todos os processos
.\scripts\windows\restart.bat           :: Reiniciar
```

### Manual (qualquer OS)

```bash
# Iniciar em desenvolvimento
npm run dev

# Parar: Ctrl+C no terminal

# Produção
npm run build && npm start
```

---

## Verificar Status

### Linux

```bash
sudo ./status.sh
```

Mostra: status do serviço, PID, memória, uptime, portas, uso de disco, status do MySQL, últimos logs.

Ou via systemctl:

```bash
sudo systemctl status iptv-web-player
```

### Windows

```batch
status.bat
```

Mostra: status do backend/frontend, PIDs, versão do Node.js, dependências, diretórios de dados, configuração, FFmpeg, URLs.

### Health Check (qualquer OS)

```bash
curl http://localhost:3001/api/health
```

---

## URLs

| Serviço | URL | Nota |
|---|---|---|
| **Backend API** | `http://localhost:3001` | REST API |
| **Frontend (dev)** | `http://localhost:5173` | Vite dev server com HMR |
| **Frontend (prod)** | `http://localhost:3001` | Servido pelo Express |
| **Health Check** | `http://localhost:3001/api/health` | Verificação de saúde |

Em produção via `install.sh`, use **Nginx Proxy Manager** para apontar um domínio com SSL para a porta 3001.

---

## Scripts npm

### Raiz do projeto (backend)

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia backend + frontend em modo desenvolvimento (concurrently) |
| `npm run server:dev` | Apenas backend com hot-reload (nodemon) |
| `npm run client:dev` | Apenas frontend dev server (Vite) |
| `npm run build` | Build de produção do frontend (`client/dist/`) |
| `npm start` | Inicia servidor em produção |
| `npm run db:migrate` | Executa schema SQL (cria/atualiza tabelas) |
| `npm run db:seed` | Insere dados iniciais (admin, planos) |
| `npm run jobs:start` | Executa scheduler de jobs em background |

### Frontend (`client/`)

| Comando | Descrição |
|---|---|
| `npm run dev` | Dev server Vite na porta 5173 |
| `npm run build` | Build de produção |
| `npm run preview` | Preview do build de produção |

---

## Reconstrução do Zero

Se precisar reconstruir o projeto completamente:

### Linux

```bash
# 1. Parar o serviço
sudo ./scripts/linux/stop.sh

# 2. Limpar tudo
rm -rf node_modules client/node_modules client/dist

# 3. Reinstalar dependências
npm install
cd client && npm install && cd ..

# 4. Recriar banco de dados (CUIDADO: apaga todos os dados!)
npm run db:migrate
npm run db:seed

# 5. Reconstruir frontend
npm run build

# 6. Reiniciar
sudo ./scripts/linux/start.sh
```

### Windows

```batch
:: 1. Parar processos
.\scripts\windows\stop.bat

:: 2. Limpar tudo
rmdir /s /q node_modules
rmdir /s /q client\node_modules
rmdir /s /q client\dist

:: 3. Reinstalar dependências
npm install
cd client && npm install && cd ..

:: 4. Recriar banco de dados (CUIDADO: apaga todos os dados!)
npm run db:migrate
npm run db:seed

:: 5. Reconstruir frontend
.\scripts\windows\rebuild-frontend.bat

:: 6. Reiniciar
.\scripts\windows\start.bat
```

> Para reconstruir apenas o frontend sem perder dados, use `scripts/linux/rebuild-frontend.sh` (Linux) ou `scripts/windows/rebuild-frontend.bat` (Windows). Use `--full` / `-f` para limpar `node_modules` antes.

---

## Backup e Restore

### Linux

```bash
# Menu interativo
sudo ./scripts/linux/backup.sh

# Backup direto via argumentos
sudo ./scripts/linux/backup.sh --db        # Apenas banco de dados
sudo ./scripts/linux/backup.sh --full      # Banco + uploads + recordings
sudo ./scripts/linux/backup.sh --list      # Listar backups
sudo ./scripts/linux/backup.sh --cleanup   # Limpar backups > 7 dias

# Restauração
sudo ./scripts/linux/restore.sh                              # Menu interativo
sudo ./scripts/linux/restore.sh --db <arquivo.sql.gz>        # Restaurar banco
sudo ./scripts/linux/restore.sh --full <arquivo.tar.gz>      # Restaurar tudo
sudo ./scripts/linux/restore.sh --list                       # Listar backups
```

Diretório padrão de backups: `/opt/iptv-backups/`

### Windows (PowerShell)

```powershell
# Menu interativo
.\scripts\windows\backup.ps1

# Backup direto
.\scripts\windows\backup.ps1 db          # Apenas banco de dados
.\scripts\windows\backup.ps1 full        # Banco + uploads + recordings
.\scripts\windows\backup.ps1 list        # Listar backups
.\scripts\windows\backup.ps1 cleanup     # Limpar backups > 7 dias

# Restauração
.\scripts\windows\restore.ps1                          # Menu interativo
.\scripts\windows\restore.ps1 db <arquivo>             # Restaurar banco
.\scripts\windows\restore.ps1 full <arquivo.zip>       # Restaurar tudo
.\scripts\windows\restore.ps1 list                     # Listar backups
```

Diretório padrão de backups: `C:\iptv-backups\`

### Variáveis de Ambiente (Backup/Restore)

Você pode customizar os diretórios via variáveis de ambiente:

```bash
# Linux
export INSTALL_DIR=/opt/iptv-web-player
export BACKUP_DIR=/opt/iptv-backups
sudo -E ./scripts/linux/backup.sh --full
```

```powershell
# Windows
$env:INSTALL_DIR = "C:\iptv-web-player"
$env:BACKUP_DIR = "D:\backups\iptv"
.\scripts\windows\backup.ps1 full
```

---

## Banco de Dados

### Informações

- **Engine**: MySQL 8.x / MariaDB 10.x+
- **Charset**: `utf8mb4` com collation `utf8mb4_unicode_ci` (suporte a emojis, grego, árabe, etc.)
- **Driver**: `mysql2` com pool de conexões (promises)

### Tabelas (20+)

| Grupo | Tabelas | Descrição |
|---|---|---|
| **Autenticação** | `users`, `refresh_tokens`, `user_sessions` | Usuários, tokens JWT, sessões por dispositivo |
| **Planos** | `plans` | Planos de assinatura com limites |
| **Conteúdo** | `playlists`, `channels`, `categories` | Playlists M3U, canais IPTV, categorias |
| **EPG** | `epg_sources`, `epg_channels`, `epg_programs`, `channel_epg_mapping` | Fontes XMLTV, programação, mapeamento |
| **Usuário** | `favorites`, `watch_history` | Favoritos e histórico de visualização |
| **DVR** | `recordings` | Gravações (agendadas, manuais, em série) |
| **Monitoramento** | `activity_logs`, `streaming_metrics`, `system_logs` | Auditoria, métricas, logs do sistema |
| **Configuração** | `settings`, `user_settings` | Config global e por usuário |

### Comandos de Migração

```bash
# Criar/atualizar schema (idempotente - usa CREATE TABLE IF NOT EXISTS)
npm run db:migrate

# Inserir dados iniciais (admin + planos padrão)
npm run db:seed
```

### Credenciais Padrão (após seed)

| Papel | Email | Senha |
|---|---|---|
| **Superadmin** | `admin@iptv.local` | `admin123` |
| **Usuário** | `user@iptv.local` | `user123` |

> **Importante**: Altere as senhas padrão após o primeiro login.

### Scripts SQL de Manutenção

```bash
# Corrigir playlists travadas em status "syncing"
mysql -u USER -p DB_NAME < scripts/linux/fix-stuck-playlists.sql

# Converter charset para utf8mb4 (se o banco foi criado com charset antigo)
mysql -u USER -p DB_NAME < scripts/linux/fix-charset-utf8mb4.sql
```

### Backup Manual do Banco

```bash
# Exportar
mysqldump -h HOST -u USER -p --single-transaction --routines --triggers DB_NAME > backup.sql

# Importar
mysql -h HOST -u USER -p DB_NAME < backup.sql
```

---

## API Endpoints

### Autenticação
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/register` | Cadastro de usuário |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh` | Renovar tokens |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Usuário atual |

### Playlists
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/playlists` | Listar playlists |
| POST | `/api/playlists/url` | Criar por URL |
| POST | `/api/playlists/upload` | Upload de arquivo M3U |
| POST | `/api/playlists/:id/sync` | Sincronizar playlist |
| DELETE | `/api/playlists/:id` | Deletar playlist |

### Canais
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/channels` | Listar canais (com filtros) |
| GET | `/api/channels/:id` | Detalhes do canal |
| GET | `/api/channels/search` | Buscar canais |
| GET | `/api/categories` | Listar categorias |

### EPG
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/epg/sources` | Listar fontes EPG |
| POST | `/api/epg/sources` | Adicionar fonte XMLTV |
| POST | `/api/epg/sources/:id/sync` | Sincronizar EPG |
| GET | `/api/epg/guide/:channelId` | Grade do canal |
| GET | `/api/epg/now/:channelId` | Programa atual |

### Gravações
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/recordings` | Listar gravações |
| POST | `/api/recordings/schedule` | Agendar gravação |
| POST | `/api/recordings/start` | Iniciar gravação |
| POST | `/api/recordings/:id/stop` | Parar gravação |

### Streaming
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/stream/token` | Gerar token de playback |
| GET | `/api/stream/check/:channelId` | Verificar disponibilidade |

### Usuário
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/users/profile` | Perfil do usuário |
| PUT | `/api/users/profile` | Atualizar perfil |
| POST | `/api/users/avatar` | Upload de avatar |
| GET | `/api/users/settings` | Configurações do usuário |

### Admin
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/admin/stats` | Estatísticas do sistema |
| GET | `/api/admin/users` | Gestão de usuários |
| GET | `/api/admin/logs/activity` | Logs de atividade |
| GET | `/api/admin/logs/system` | Logs do sistema |
| GET | `/api/admin/plans` | Gestão de planos |

### Utilitários
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Health check |

---

## Scripts de Gerenciamento

### Linux

| Script | Descrição | Uso |
|---|---|---|
| `scripts/linux/install.sh` | Instalação automática completa | `sudo ./scripts/linux/install.sh` |
| `scripts/linux/uninstall.sh` | Remover instalação | `sudo ./scripts/linux/uninstall.sh` |
| `scripts/linux/update.sh` | Atualizar aplicação (git pull + rebuild) | `sudo ./scripts/linux/update.sh` |
| `scripts/linux/start.sh` | Iniciar serviço systemd | `sudo ./scripts/linux/start.sh` |
| `scripts/linux/stop.sh` | Parar serviço | `sudo ./scripts/linux/stop.sh` |
| `scripts/linux/restart.sh` | Reiniciar serviço | `sudo ./scripts/linux/restart.sh` |
| `scripts/linux/status.sh` | Status detalhado | `sudo ./scripts/linux/status.sh` |
| `scripts/linux/logs.sh` | Visualizar logs | `sudo ./scripts/linux/logs.sh [-n 50] [-e] [-t]` |
| `scripts/linux/rebuild-frontend.sh` | Reconstruir frontend | `sudo ./scripts/linux/rebuild-frontend.sh [--full]` |
| `scripts/linux/backup.sh` | Backup do banco e arquivos | `sudo ./scripts/linux/backup.sh --full` |
| `scripts/linux/restore.sh` | Restaurar backup | `sudo ./scripts/linux/restore.sh --full <arquivo>` |

### Windows

| Script | Descrição | Uso |
|---|---|---|
| `scripts\windows\start.bat` | Iniciar aplicação | `.\scripts\windows\start.bat [--prod]` |
| `scripts\windows\stop.bat` | Parar processos | `.\scripts\windows\stop.bat` |
| `scripts\windows\restart.bat` | Reiniciar | `.\scripts\windows\restart.bat` |
| `scripts\windows\status.bat` | Status detalhado | `.\scripts\windows\status.bat` |
| `scripts\windows\rebuild-frontend.bat` | Reconstruir frontend | `.\scripts\windows\rebuild-frontend.bat [--full]` |
| `scripts\windows\backup.ps1` | Backup (PowerShell) | `.\scripts\windows\backup.ps1 full` |
| `scripts\windows\restore.ps1` | Restore (PowerShell) | `.\scripts\windows\restore.ps1 full <arquivo>` |

---

## Licença

MIT

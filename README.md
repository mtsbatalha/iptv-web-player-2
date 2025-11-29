# IPTV Web Player

Sistema completo de gerenciamento e reprodução de IPTV, desenvolvido para ambiente de hospedagem compartilhada com DirectAdmin + MySQL.

## Funcionalidades

### Usuários e Autenticação
- Cadastro e login com JWT
- Múltiplos papéis (user, moderator, admin, superadmin)
- Planos com limites configuráveis
- Gestão de sessões e dispositivos

### Playlists IPTV
- Importação por URL (M3U/M3U8)
- Upload de arquivo
- Parser inteligente com detecção de categorias
- Atualização automática configurável
- Sincronização manual

### Canais
- Listagem com filtros e busca
- Categorização automática
- Favoritos
- Histórico de visualização
- Player HLS integrado

### EPG (Electronic Program Guide)
- Importação de fontes XMLTV
- Grade de programação
- Programa atual e próximo
- Mapeamento automático canal/EPG

### DVR / Gravações
- Gravação agendada
- Gravação imediata
- Gerenciamento de arquivos
- Limites por plano

### Painel Administrativo
- Dashboard com estatísticas
- Gestão de usuários
- Gestão de planos
- Logs de atividade e sistema
- Configurações globais

## Tecnologias

### Backend
- **Node.js** com Express
- **MySQL 8.x** como banco de dados
- **JWT** para autenticação
- **node-cron** para jobs em background
- **multer** para upload de arquivos
- **axios** para requisições HTTP

### Frontend
- **React 18** com Vite
- **TailwindCSS** para estilização
- **Zustand** para gerenciamento de estado
- **HLS.js** para reprodução de streams
- **React Router** para navegação
- **react-hot-toast** para notificações

## Instalação

### Requisitos
- Node.js 18+
- MySQL 8.x
- FFmpeg (para DVR/gravações)

### Instalação Automática (Linux - Recomendado)

Para Debian 11/12/13 ou Ubuntu 20.04/22.04/24.04, use o script de instalação automática:

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/iptv-web-player.git
cd iptv-web-player

# Execute o instalador como root
sudo chmod +x install.sh
sudo ./install.sh
```

O instalador irá:
- Detectar automaticamente seu sistema operacional
- Instalar todas as dependências (Node.js, MySQL, Nginx, FFmpeg)
- Configurar o banco de dados
- Criar serviço systemd para auto-start
- Configurar Nginx como reverse proxy
- (Opcional) Configurar SSL com Let's Encrypt

**Scripts disponíveis:**
- `install.sh` - Instalação completa
- `update.sh` - Atualizar a aplicação
- `uninstall.sh` - Remover a instalação

### Instalação Manual

1. Clone o repositório
2. Copie `.env.example` para `.env` e configure as variáveis

```bash
cp .env.example .env
```

3. Instale as dependências

```bash
# Backend
npm install

# Frontend
cd client && npm install
```

4. Configure o banco de dados

```bash
npm run db:migrate
npm run db:seed
```

5. Inicie o servidor

```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm start
```

### Gerenciamento do Serviço (após instalação automática)

```bash
# Status do serviço
sudo systemctl status iptv-web-player

# Iniciar/Parar/Reiniciar
sudo systemctl start iptv-web-player
sudo systemctl stop iptv-web-player
sudo systemctl restart iptv-web-player

# Ver logs em tempo real
sudo journalctl -u iptv-web-player -f
```

## Estrutura do Projeto

```
iptv-web-player/
├── server/
│   ├── database/
│   │   ├── connection.js
│   │   ├── migrate.js
│   │   ├── schema.sql
│   │   └── seed.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   ├── logger.js
│   │   ├── upload.js
│   │   └── validators.js
│   ├── routes/
│   │   ├── admin.js
│   │   ├── auth.js
│   │   ├── categories.js
│   │   ├── channels.js
│   │   ├── epg.js
│   │   ├── favorites.js
│   │   ├── history.js
│   │   ├── playlists.js
│   │   ├── recordings.js
│   │   ├── settings.js
│   │   ├── stream.js
│   │   └── users.js
│   ├── services/
│   │   ├── epgParser.js
│   │   └── m3uParser.js
│   ├── jobs/
│   │   └── scheduler.js
│   └── index.js
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   └── VideoPlayer.jsx
│   │   ├── layouts/
│   │   │   ├── AdminLayout.jsx
│   │   │   ├── AuthLayout.jsx
│   │   │   └── MainLayout.jsx
│   │   ├── pages/
│   │   │   ├── admin/
│   │   │   ├── auth/
│   │   │   └── ...
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── stores/
│   │   │   └── authStore.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
├── uploads/
├── recordings/
├── package.json
└── .env
```

## API Endpoints

### Autenticação
- `POST /api/auth/register` - Cadastro
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Usuário atual

### Playlists
- `GET /api/playlists` - Listar playlists
- `POST /api/playlists/url` - Criar por URL
- `POST /api/playlists/upload` - Upload de arquivo
- `POST /api/playlists/:id/sync` - Sincronizar
- `DELETE /api/playlists/:id` - Deletar

### Canais
- `GET /api/channels` - Listar canais
- `GET /api/channels/:id` - Detalhes do canal
- `GET /api/channels/search` - Buscar

### EPG
- `GET /api/epg/sources` - Fontes de EPG
- `POST /api/epg/sources` - Adicionar fonte
- `GET /api/epg/guide/:channelId` - Grade do canal
- `GET /api/epg/now/:channelId` - Programa atual

### Gravações
- `GET /api/recordings` - Listar gravações
- `POST /api/recordings/schedule` - Agendar
- `POST /api/recordings/start` - Iniciar
- `POST /api/recordings/:id/stop` - Parar

## Segurança

- Rate limiting global e por rota
- Tokens JWT com refresh
- Validação de entrada com express-validator
- Proteção contra hotlinking
- Logs de atividade
- Controle de permissões por papel

## Credenciais Padrão

Após executar o seed:

- **Admin**: admin@iptv.local / admin123
- **Usuário**: user@iptv.local / user123

## Licença

MIT

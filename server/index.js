import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { testConnection } from './database/connection.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logger.js';

// Rotas
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import playlistRoutes from './routes/playlists.js';
import channelRoutes from './routes/channels.js';
import categoryRoutes from './routes/categories.js';
import epgRoutes from './routes/epg.js';
import favoriteRoutes from './routes/favorites.js';
import historyRoutes from './routes/history.js';
import recordingRoutes from './routes/recordings.js';
import streamRoutes from './routes/stream.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (para rate limit funcionar corretamente atrás de proxy)
app.set('trust proxy', 1);

// Middlewares de segurança
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
}));

// CORS
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting global
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        success: false,
        error: 'Muitas requisições. Tente novamente mais tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for localhost in development
    skip: (req) => process.env.NODE_ENV === 'development' &&
        (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1')
});

app.use('/api', limiter);

// Rate limit mais restrito para autenticação
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 100 : 10,
    message: {
        success: false,
        error: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
    },
    // Skip rate limiting for localhost in development
    skip: (req) => process.env.NODE_ENV === 'development' &&
        (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1')
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Compressão
app.use(compression());

// Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
}
app.use(requestLogger);

// Arquivos estáticos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Recordings with proper video MIME types and CORS
app.use('/recordings', (req, res, next) => {
    // Set CORS headers for video playback
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Accept-Ranges', 'bytes');

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
}, express.static(path.join(__dirname, '../recordings'), {
    setHeaders: (res, filePath) => {
        // Set correct MIME type for MP4 files
        if (filePath.endsWith('.mp4')) {
            res.setHeader('Content-Type', 'video/mp4');
        }
    }
}));

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'API IPTV Player funcionando',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/epg', epgRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);

// Servir frontend em produção
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/dist')));

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../client/dist/index.html'));
    });
}

// Handlers de erro
app.use(notFoundHandler);
app.use(errorHandler);

// Iniciar servidor
async function startServer() {
    // Testar conexão com banco
    const dbConnected = await testConnection();

    if (!dbConnected) {
        console.error('❌ Não foi possível conectar ao banco de dados');
        process.exit(1);
    }

    // Inicializar scheduler de jobs (atualização automática de playlists, EPG, etc)
    await import('./jobs/scheduler.js');

    app.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🎬 IPTV Web Player - Backend                        ║
║                                                       ║
║   Servidor rodando em: http://localhost:${PORT}          ║
║   Ambiente: ${process.env.NODE_ENV || 'development'}                            ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
        `);
    });
}

startServer();

export default app;

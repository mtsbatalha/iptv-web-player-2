import express from 'express';
import axios from 'axios';
import { query } from '../database/connection.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import streamManager from '../services/streamManager.js';

const router = express.Router();

// Cache de tokens de stream (em produção, usar Redis)
const streamTokens = new Map();

// Gerar token de stream
router.post('/token', authenticate, asyncHandler(async (req, res) => {
    const { channelId } = req.body;

    if (!channelId) {
        throw Errors.BadRequest('ID do canal é obrigatório');
    }

    // Verificar acesso ao canal
    const [channel] = await query(`
        SELECT c.id, c.uuid, c.stream_url, c.name
        FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE c.id = ? AND p.user_id = ? AND c.is_active = TRUE
    `, [channelId, req.user.id]);

    if (!channel) {
        throw Errors.NotFound('Canal');
    }

    // Gerar token único
    const token = Buffer.from(`${channel.id}:${req.user.id}:${Date.now()}`).toString('base64url');

    // Armazenar token (expira em 6 horas)
    streamTokens.set(token, {
        channelId: channel.id,
        userId: req.user.id,
        streamUrl: channel.stream_url,
        channelName: channel.name,
        createdAt: Date.now(),
        expiresAt: Date.now() + 6 * 60 * 60 * 1000
    });

    // Limpar tokens expirados periodicamente
    cleanExpiredTokens();

    res.json({
        success: true,
        data: {
            token,
            streamUrl: `/api/stream/play/${token}`,
            directUrl: channel.stream_url, // Para players que suportam
            expiresIn: 6 * 60 * 60 // 6 horas em segundos
        }
    });
}));

// Proxy de stream (with connection sharing via StreamManager)
router.get('/play/:token', asyncHandler(async (req, res) => {
    const { token } = req.params;

    const streamData = streamTokens.get(token);

    if (!streamData) {
        throw Errors.Unauthorized('Token de stream inválido ou expirado');
    }

    if (Date.now() > streamData.expiresAt) {
        streamTokens.delete(token);
        throw Errors.Unauthorized('Token de stream expirado');
    }

    try {
        console.log(`[Stream] Proxy iniciado: ${streamData.channelName}`);
        console.log(`[Stream] URL: ${streamData.streamUrl}`);

        // Get shared stream from StreamManager (waits for connection)
        const { stream, contentType } = await streamManager.getStream(
            streamData.streamUrl,
            streamData.channelName
        );

        console.log(`[Stream] Content-Type: ${contentType}`);

        // Headers CORS e de streaming
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        // Pipe shared stream to response
        stream.pipe(res);

        // Cleanup when client disconnects
        req.on('close', () => {
            console.log(`[Stream] Cliente desconectou: ${streamData.channelName}`);
            stream.destroy();
        });

        // Register view
        registerView(streamData.userId, streamData.channelId).catch(console.error);

    } catch (error) {
        console.error('[Stream] Erro no proxy:', error.message);

        if (error.response) {
            throw Errors.BadRequest(`Erro ao acessar stream: ${error.response.status}`);
        }

        throw Errors.Internal('Erro ao processar stream');
    }
}));

// Internal stream endpoint for recorder (no auth, localhost only)
router.get('/internal/:channelId', asyncHandler(async (req, res) => {
    const { channelId } = req.params;
    const internalKey = req.query.key;

    // Security: Only allow internal requests
    const clientIp = req.ip || req.connection.remoteAddress;
    const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';

    if (!isLocalhost && internalKey !== process.env.INTERNAL_STREAM_KEY) {
        throw Errors.Forbidden('Acesso negado');
    }

    // Get channel stream URL directly from database
    const [channel] = await query(`
        SELECT c.id, c.stream_url, c.name FROM channels c
        WHERE c.id = ? AND c.is_active = TRUE
    `, [channelId]);

    if (!channel || !channel.stream_url) {
        throw Errors.NotFound('Canal');
    }

    console.log(`[Stream] Internal stream request: ${channel.name}`);

    // Get shared stream from StreamManager (waits for connection)
    const { stream, contentType } = await streamManager.getStream(
        channel.stream_url,
        channel.name
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store');

    stream.pipe(res);

    req.on('close', () => {
        console.log(`[Stream] Internal client disconnected: ${channel.name}`);
        stream.destroy();
    });
}));

// Proxy de playlist M3U8 (HLS)
router.get('/hls/:token/:segment', asyncHandler(async (req, res) => {
    const { token, segment } = req.params;

    const streamData = streamTokens.get(token);

    if (!streamData || Date.now() > streamData.expiresAt) {
        throw Errors.Unauthorized('Token inválido');
    }

    try {
        // Construir URL do segmento
        const baseUrl = new URL(streamData.streamUrl);
        const segmentUrl = new URL(segment, baseUrl).href;

        const response = await axios({
            method: 'GET',
            url: segmentUrl,
            responseType: 'stream',
            timeout: 30000
        });

        const contentType = segment.endsWith('.ts')
            ? 'video/mp2t'
            : segment.endsWith('.m3u8')
                ? 'application/vnd.apple.mpegurl'
                : 'application/octet-stream';

        res.setHeader('Content-Type', contentType);
        response.data.pipe(res);

    } catch (error) {
        throw Errors.BadRequest('Erro ao acessar segmento');
    }
}));

// Verificar disponibilidade do stream
router.get('/check/:channelId', authenticate, asyncHandler(async (req, res) => {
    const { channelId } = req.params;

    const [channel] = await query(`
        SELECT c.stream_url FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE c.id = ? AND p.user_id = ?
    `, [channelId, req.user.id]);

    if (!channel) {
        throw Errors.NotFound('Canal');
    }

    try {
        const response = await axios.head(channel.stream_url, {
            timeout: 10000,
            validateStatus: () => true
        });

        const isAvailable = response.status >= 200 && response.status < 400;
        const contentType = response.headers['content-type'] || '';

        res.json({
            success: true,
            data: {
                available: isAvailable,
                status: response.status,
                contentType,
                streamType: detectStreamType(contentType, channel.stream_url)
            }
        });

    } catch (error) {
        res.json({
            success: true,
            data: {
                available: false,
                error: error.message
            }
        });
    }
}));

// Obter informações do stream
router.get('/info/:channelId', authenticate, asyncHandler(async (req, res) => {
    const { channelId } = req.params;

    const [channel] = await query(`
        SELECT c.id, c.name, c.stream_url, c.logo_url, c.quality, c.stream_type
        FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE c.id = ? AND p.user_id = ?
    `, [channelId, req.user.id]);

    if (!channel) {
        throw Errors.NotFound('Canal');
    }

    // Tentar obter metadados do stream
    let metadata = {};

    try {
        const response = await axios.head(channel.stream_url, { timeout: 5000 });
        metadata = {
            contentType: response.headers['content-type'],
            contentLength: response.headers['content-length']
        };
    } catch (e) {
        // Ignorar erros
    }

    res.json({
        success: true,
        data: {
            channel: {
                id: channel.id,
                name: channel.name,
                logoUrl: channel.logo_url,
                quality: channel.quality,
                streamType: channel.stream_type
            },
            stream: {
                url: channel.stream_url,
                type: detectStreamType(metadata.contentType, channel.stream_url),
                ...metadata
            }
        }
    });
}));

// Helper para detectar tipo de stream
function detectStreamType(contentType, url) {
    const lowerUrl = url.toLowerCase();
    const lowerType = (contentType || '').toLowerCase();

    if (lowerUrl.includes('.m3u8') || lowerType.includes('mpegurl') || lowerType.includes('x-mpegurl')) {
        return 'hls';
    }

    if (lowerUrl.includes('.mpd') || lowerType.includes('dash')) {
        return 'dash';
    }

    if (lowerUrl.includes('.ts') || lowerType.includes('mp2t')) {
        return 'ts';
    }

    if (lowerUrl.includes('rtmp://')) {
        return 'rtmp';
    }

    return 'unknown';
}

// Helper para registrar visualização
async function registerView(userId, channelId) {
    try {
        await query(`
            INSERT INTO watch_history (user_id, channel_id, duration)
            VALUES (?, ?, 0)
        `, [userId, channelId]);
    } catch (error) {
        console.error('Erro ao registrar visualização:', error);
    }
}

// Limpar tokens expirados
function cleanExpiredTokens() {
    const now = Date.now();

    for (const [token, data] of streamTokens.entries()) {
        if (now > data.expiresAt) {
            streamTokens.delete(token);
        }
    }
}

// Limpar periodicamente
setInterval(cleanExpiredTokens, 60 * 60 * 1000); // A cada hora

export default router;

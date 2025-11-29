import express from 'express';
import { query } from '../database/connection.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { paginationValidator } from '../middleware/validators.js';

const router = express.Router();

// Listar histórico de visualização
router.get('/', authenticate, paginationValidator, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const { period } = req.query;

    let dateFilter = '';
    if (period) {
        const periods = {
            today: 'DATE(wh.watched_at) = CURDATE()',
            week: 'wh.watched_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)',
            month: 'wh.watched_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
        };
        dateFilter = periods[period] ? `AND ${periods[period]}` : '';
    }

    const history = await query(`
        SELECT
            wh.id, wh.watched_at, wh.duration, wh.device_type,
            c.id as channel_id, c.uuid, c.name, c.logo_url, c.group_title, c.stream_type,
            p.name as playlist_name
        FROM watch_history wh
        JOIN channels c ON wh.channel_id = c.id
        JOIN playlists p ON c.playlist_id = p.id
        WHERE wh.user_id = ? ${dateFilter}
        ORDER BY wh.watched_at DESC
        LIMIT ? OFFSET ?
    `, [req.user.id, limit, offset]);

    const [{ total }] = await query(`
        SELECT COUNT(*) as total FROM watch_history wh
        WHERE wh.user_id = ? ${dateFilter}
    `, [req.user.id]);

    // Agrupar por data
    const groupedHistory = {};
    history.forEach(h => {
        const date = new Date(h.watched_at).toISOString().split('T')[0];
        if (!groupedHistory[date]) {
            groupedHistory[date] = [];
        }
        groupedHistory[date].push({
            id: h.id,
            watchedAt: h.watched_at,
            duration: h.duration,
            deviceType: h.device_type,
            channel: {
                id: h.channel_id,
                uuid: h.uuid,
                name: h.name,
                logoUrl: h.logo_url,
                groupTitle: h.group_title,
                streamType: h.stream_type,
                playlistName: h.playlist_name
            }
        });
    });

    res.json({
        success: true,
        data: {
            history: groupedHistory,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        }
    });
}));

// Registrar visualização
router.post('/', authenticate, asyncHandler(async (req, res) => {
    const { channelId, duration, deviceType } = req.body;

    if (!channelId) {
        throw Errors.BadRequest('ID do canal é obrigatório');
    }

    // Verificar se canal pertence ao usuário
    const [channel] = await query(`
        SELECT c.id FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE c.id = ? AND p.user_id = ?
    `, [channelId, req.user.id]);

    if (!channel) {
        throw Errors.NotFound('Canal');
    }

    await query(`
        INSERT INTO watch_history (user_id, channel_id, duration, device_type)
        VALUES (?, ?, ?, ?)
    `, [req.user.id, channelId, duration || 0, deviceType || 'unknown']);

    res.status(201).json({
        success: true,
        message: 'Visualização registrada'
    });
}));

// Atualizar duração da visualização
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { duration } = req.body;

    await query(`
        UPDATE watch_history SET duration = ?
        WHERE id = ? AND user_id = ?
    `, [duration, id, req.user.id]);

    res.json({
        success: true,
        message: 'Duração atualizada'
    });
}));

// Limpar histórico
router.delete('/clear', authenticate, asyncHandler(async (req, res) => {
    const { period } = req.query;

    let sql = 'DELETE FROM watch_history WHERE user_id = ?';
    const params = [req.user.id];

    if (period) {
        const periods = {
            today: 'AND DATE(watched_at) = CURDATE()',
            week: 'AND watched_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)',
            month: 'AND watched_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
        };

        if (periods[period]) {
            sql += ` ${periods[period]}`;
        }
    }

    await query(sql, params);

    res.json({
        success: true,
        message: 'Histórico limpo'
    });
}));

// Deletar item específico do histórico
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;

    await query(
        'DELETE FROM watch_history WHERE id = ? AND user_id = ?',
        [id, req.user.id]
    );

    res.json({
        success: true,
        message: 'Item removido do histórico'
    });
}));

// Estatísticas de visualização
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
    // Total de tempo assistido
    const [totalTime] = await query(`
        SELECT COALESCE(SUM(duration), 0) as total
        FROM watch_history WHERE user_id = ?
    `, [req.user.id]);

    // Canais mais assistidos
    const topChannels = await query(`
        SELECT
            c.id, c.name, c.logo_url,
            COUNT(*) as view_count,
            SUM(wh.duration) as total_duration
        FROM watch_history wh
        JOIN channels c ON wh.channel_id = c.id
        WHERE wh.user_id = ?
        GROUP BY c.id
        ORDER BY view_count DESC
        LIMIT 10
    `, [req.user.id]);

    // Visualizações por dia (últimos 7 dias)
    const dailyStats = await query(`
        SELECT
            DATE(watched_at) as date,
            COUNT(*) as views,
            SUM(duration) as duration
        FROM watch_history
        WHERE user_id = ? AND watched_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(watched_at)
        ORDER BY date DESC
    `, [req.user.id]);

    // Categorias mais assistidas
    const topCategories = await query(`
        SELECT
            c.group_title as category,
            COUNT(*) as view_count
        FROM watch_history wh
        JOIN channels c ON wh.channel_id = c.id
        WHERE wh.user_id = ? AND c.group_title IS NOT NULL
        GROUP BY c.group_title
        ORDER BY view_count DESC
        LIMIT 5
    `, [req.user.id]);

    res.json({
        success: true,
        data: {
            totalWatchTime: totalTime.total,
            topChannels,
            dailyStats,
            topCategories
        }
    });
}));

export default router;

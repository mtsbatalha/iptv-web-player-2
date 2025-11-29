import express from 'express';
import { query } from '../database/connection.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { authenticate, checkPlanLimit } from '../middleware/auth.js';
import { idValidator } from '../middleware/validators.js';

const router = express.Router();

// Listar favoritos
router.get('/', authenticate, asyncHandler(async (req, res) => {
    const favorites = await query(`
        SELECT
            f.id, f.order_index, f.added_at,
            c.id as channel_id, c.uuid, c.name, c.stream_url, c.logo_url,
            c.tvg_id, c.group_title, c.stream_type, c.quality,
            p.id as playlist_id, p.name as playlist_name
        FROM favorites f
        JOIN channels c ON f.channel_id = c.id
        JOIN playlists p ON c.playlist_id = p.id
        WHERE f.user_id = ? AND c.is_active = TRUE
        ORDER BY f.order_index, f.added_at DESC
    `, [req.user.id]);

    res.json({
        success: true,
        data: {
            favorites: favorites.map(f => ({
                id: f.id,
                orderIndex: f.order_index,
                addedAt: f.added_at,
                channel: {
                    id: f.channel_id,
                    uuid: f.uuid,
                    name: f.name,
                    streamUrl: f.stream_url,
                    logoUrl: f.logo_url,
                    tvgId: f.tvg_id,
                    groupTitle: f.group_title,
                    streamType: f.stream_type,
                    quality: f.quality,
                    playlist: {
                        id: f.playlist_id,
                        name: f.playlist_name
                    }
                }
            }))
        }
    });
}));

// Adicionar favorito
router.post('/:channelId', authenticate, checkPlanLimit('favorites'), asyncHandler(async (req, res) => {
    const { channelId } = req.params;

    // Verificar se canal existe e pertence ao usuário
    const [channel] = await query(`
        SELECT c.id, c.name FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE c.id = ? AND p.user_id = ?
    `, [channelId, req.user.id]);

    if (!channel) {
        throw Errors.NotFound('Canal');
    }

    // Verificar se já é favorito
    const [existing] = await query(
        'SELECT id FROM favorites WHERE user_id = ? AND channel_id = ?',
        [req.user.id, channelId]
    );

    if (existing) {
        throw Errors.Conflict('Canal já está nos favoritos');
    }

    // Obter próximo order_index
    const [{ maxOrder }] = await query(
        'SELECT COALESCE(MAX(order_index), 0) as maxOrder FROM favorites WHERE user_id = ?',
        [req.user.id]
    );

    await query(
        'INSERT INTO favorites (user_id, channel_id, order_index) VALUES (?, ?, ?)',
        [req.user.id, channelId, maxOrder + 1]
    );

    res.status(201).json({
        success: true,
        message: `${channel.name} adicionado aos favoritos`
    });
}));

// Remover favorito
router.delete('/:channelId', authenticate, asyncHandler(async (req, res) => {
    const { channelId } = req.params;

    const result = await query(
        'DELETE FROM favorites WHERE user_id = ? AND channel_id = ?',
        [req.user.id, channelId]
    );

    if (result.affectedRows === 0) {
        throw Errors.NotFound('Favorito');
    }

    res.json({
        success: true,
        message: 'Removido dos favoritos'
    });
}));

// Reordenar favoritos
router.put('/reorder', authenticate, asyncHandler(async (req, res) => {
    const { order } = req.body;

    if (!Array.isArray(order)) {
        throw Errors.BadRequest('Ordem deve ser um array de IDs');
    }

    // Atualizar ordem
    for (let i = 0; i < order.length; i++) {
        await query(
            'UPDATE favorites SET order_index = ? WHERE id = ? AND user_id = ?',
            [i, order[i], req.user.id]
        );
    }

    res.json({
        success: true,
        message: 'Ordem atualizada'
    });
}));

// Verificar se canal é favorito
router.get('/check/:channelId', authenticate, asyncHandler(async (req, res) => {
    const { channelId } = req.params;

    const [favorite] = await query(
        'SELECT id FROM favorites WHERE user_id = ? AND channel_id = ?',
        [req.user.id, channelId]
    );

    res.json({
        success: true,
        data: {
            isFavorite: !!favorite
        }
    });
}));

export default router;

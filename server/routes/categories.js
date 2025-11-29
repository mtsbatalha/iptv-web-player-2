import express from 'express';
import { query } from '../database/connection.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { idValidator } from '../middleware/validators.js';

const router = express.Router();

// Listar todas as categorias do usuário
router.get('/', authenticate, asyncHandler(async (req, res) => {
    const { playlistId } = req.query;

    let sql = `
        SELECT
            c.id, c.name, c.slug, c.icon, c.color, c.is_custom,
            COUNT(ch.id) as channel_count,
            p.id as playlist_id, p.name as playlist_name
        FROM categories c
        LEFT JOIN channels ch ON ch.category_id = c.id AND ch.is_active = TRUE
        LEFT JOIN playlists p ON c.playlist_id = p.id
        WHERE (c.user_id = ? OR c.user_id IS NULL)
    `;

    const params = [req.user.id];

    if (playlistId) {
        sql += ' AND c.playlist_id = ?';
        params.push(playlistId);
    }

    sql += ' GROUP BY c.id ORDER BY c.order_index, c.name';

    const categories = await query(sql, params);

    res.json({
        success: true,
        data: {
            categories: categories.map(cat => ({
                id: cat.id,
                name: cat.name,
                slug: cat.slug,
                icon: cat.icon,
                color: cat.color,
                isCustom: !!cat.is_custom,
                channelCount: cat.channel_count,
                playlist: cat.playlist_id ? {
                    id: cat.playlist_id,
                    name: cat.playlist_name
                } : null
            }))
        }
    });
}));

// Listar grupos únicos (group_title dos canais)
router.get('/groups', authenticate, asyncHandler(async (req, res) => {
    const { playlistId } = req.query;

    let sql = `
        SELECT
            c.group_title as name,
            COUNT(c.id) as channel_count
        FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE p.user_id = ? AND c.is_active = TRUE AND c.group_title IS NOT NULL
    `;

    const params = [req.user.id];

    if (playlistId) {
        sql += ' AND p.id = ?';
        params.push(playlistId);
    }

    sql += ' GROUP BY c.group_title ORDER BY c.group_title';

    const groups = await query(sql, params);

    res.json({
        success: true,
        data: { groups }
    });
}));

// Criar categoria customizada
router.post('/', authenticate, asyncHandler(async (req, res) => {
    const { name, icon, color, playlistId } = req.body;

    if (!name) {
        throw Errors.BadRequest('Nome da categoria é obrigatório');
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const result = await query(`
        INSERT INTO categories (user_id, playlist_id, name, slug, icon, color, is_custom)
        VALUES (?, ?, ?, ?, ?, ?, TRUE)
    `, [req.user.id, playlistId || null, name, slug, icon || null, color || null]);

    res.status(201).json({
        success: true,
        message: 'Categoria criada com sucesso',
        data: {
            id: result.insertId,
            name,
            slug,
            icon,
            color
        }
    });
}));

// Atualizar categoria
router.put('/:id', authenticate, idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, icon, color, orderIndex } = req.body;

    // Verificar propriedade
    const [category] = await query(
        'SELECT id FROM categories WHERE id = ? AND user_id = ? AND is_custom = TRUE',
        [id, req.user.id]
    );

    if (!category) {
        throw Errors.NotFound('Categoria');
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
        updates.push('name = ?', 'slug = ?');
        values.push(name, name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    }

    if (icon !== undefined) {
        updates.push('icon = ?');
        values.push(icon);
    }

    if (color !== undefined) {
        updates.push('color = ?');
        values.push(color);
    }

    if (orderIndex !== undefined) {
        updates.push('order_index = ?');
        values.push(orderIndex);
    }

    if (updates.length > 0) {
        values.push(id);
        await query(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    res.json({
        success: true,
        message: 'Categoria atualizada com sucesso'
    });
}));

// Deletar categoria
router.delete('/:id', authenticate, idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [category] = await query(
        'SELECT id FROM categories WHERE id = ? AND user_id = ? AND is_custom = TRUE',
        [id, req.user.id]
    );

    if (!category) {
        throw Errors.NotFound('Categoria');
    }

    // Remover categoria dos canais
    await query('UPDATE channels SET category_id = NULL WHERE category_id = ?', [id]);

    // Deletar categoria
    await query('DELETE FROM categories WHERE id = ?', [id]);

    res.json({
        success: true,
        message: 'Categoria deletada com sucesso'
    });
}));

// Mover canais para categoria
router.post('/:id/channels', authenticate, idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { channelIds } = req.body;

    if (!Array.isArray(channelIds) || channelIds.length === 0) {
        throw Errors.BadRequest('IDs dos canais são obrigatórios');
    }

    // Verificar propriedade da categoria
    const [category] = await query(
        'SELECT id FROM categories WHERE id = ? AND (user_id = ? OR user_id IS NULL)',
        [id, req.user.id]
    );

    if (!category) {
        throw Errors.NotFound('Categoria');
    }

    // Atualizar canais
    await query(`
        UPDATE channels c
        JOIN playlists p ON c.playlist_id = p.id
        SET c.category_id = ?
        WHERE c.id IN (?) AND p.user_id = ?
    `, [id, channelIds, req.user.id]);

    res.json({
        success: true,
        message: 'Canais movidos para a categoria'
    });
}));

export default router;

import express from 'express';
import { query } from '../database/connection.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { paginationValidator, idValidator } from '../middleware/validators.js';

const router = express.Router();

// Listar todos os canais do usuário
router.get('/', authenticate, paginationValidator, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const {
        playlistId,
        categoryId,
        groupTitle,
        search,
        streamType,
        quality,
        showAdult
    } = req.query;

    let sql = `
        SELECT
            c.id, c.uuid, c.name, c.stream_url, c.logo_url, c.tvg_id,
            c.group_title, c.stream_type, c.quality, c.is_active,
            p.id as playlist_id, p.name as playlist_name,
            cat.id as category_id, cat.name as category_name,
            EXISTS(SELECT 1 FROM favorites f WHERE f.channel_id = c.id AND f.user_id = ?) as is_favorite
        FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        LEFT JOIN categories cat ON c.category_id = cat.id
        WHERE p.user_id = ? AND c.is_active = TRUE
    `;

    const params = [req.user.id, req.user.id];

    if (playlistId) {
        sql += ' AND p.id = ?';
        params.push(playlistId);
    }

    if (categoryId) {
        sql += ' AND c.category_id = ?';
        params.push(categoryId);
    }

    if (groupTitle) {
        sql += ' AND c.group_title = ?';
        params.push(groupTitle);
    }

    if (search) {
        sql += ' AND (c.name LIKE ? OR c.tvg_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }

    if (streamType) {
        sql += ' AND c.stream_type = ?';
        params.push(streamType);
    }

    if (quality) {
        sql += ' AND c.quality = ?';
        params.push(quality);
    }

    if (!showAdult || showAdult === 'false') {
        sql += ' AND c.is_adult = FALSE';
    }

    // Contagem total
    const countSql = sql.replace(/SELECT[\s\S]+FROM/, 'SELECT COUNT(*) as total FROM');
    const [{ total }] = await query(countSql, params);

    // Adicionar ordenação e paginação
    sql += ' ORDER BY c.group_title, c.name LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const channels = await query(sql, params);

    res.json({
        success: true,
        data: {
            channels: channels.map(ch => ({
                id: ch.id,
                uuid: ch.uuid,
                name: ch.name,
                streamUrl: ch.stream_url,
                logoUrl: ch.logo_url,
                tvgId: ch.tvg_id,
                groupTitle: ch.group_title,
                streamType: ch.stream_type,
                quality: ch.quality,
                isActive: !!ch.is_active,
                isFavorite: !!ch.is_favorite,
                playlist: {
                    id: ch.playlist_id,
                    name: ch.playlist_name
                },
                category: ch.category_id ? {
                    id: ch.category_id,
                    name: ch.category_name
                } : null
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        }
    });
}));

// Buscar canais
router.get('/search', authenticate, asyncHandler(async (req, res) => {
    const { q, limit = 20 } = req.query;

    if (!q || q.length < 2) {
        return res.json({
            success: true,
            data: { channels: [] }
        });
    }

    const channels = await query(`
        SELECT
            c.id, c.uuid, c.name, c.logo_url, c.group_title, c.stream_type, c.quality,
            p.name as playlist_name
        FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE p.user_id = ? AND c.is_active = TRUE
            AND (c.name LIKE ? OR c.tvg_name LIKE ? OR c.group_title LIKE ?)
        ORDER BY
            CASE
                WHEN c.name LIKE ? THEN 1
                WHEN c.name LIKE ? THEN 2
                ELSE 3
            END,
            c.name
        LIMIT ?
    `, [
        req.user.id,
        `%${q}%`, `%${q}%`, `%${q}%`,
        `${q}%`, `%${q}%`,
        parseInt(limit)
    ]);

    res.json({
        success: true,
        data: {
            channels: channels.map(ch => ({
                id: ch.id,
                uuid: ch.uuid,
                name: ch.name,
                logoUrl: ch.logo_url,
                groupTitle: ch.group_title,
                streamType: ch.stream_type,
                quality: ch.quality,
                playlistName: ch.playlist_name
            }))
        }
    });
}));

// Obter canal específico
router.get('/:id', authenticate, idValidator, asyncHandler(async (req, res) => {
    const [channel] = await query(`
        SELECT
            c.*,
            p.id as playlist_id, p.name as playlist_name,
            cat.id as category_id, cat.name as category_name,
            EXISTS(SELECT 1 FROM favorites f WHERE f.channel_id = c.id AND f.user_id = ?) as is_favorite
        FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        LEFT JOIN categories cat ON c.category_id = cat.id
        WHERE c.id = ? AND p.user_id = ?
    `, [req.user.id, req.params.id, req.user.id]);

    if (!channel) {
        throw Errors.NotFound('Canal');
    }

    // Buscar EPG atual e próximo
    let currentProgram = null;
    let nextProgram = null;

    if (channel.tvg_id) {
        const programs = await query(`
            SELECT
                ep.id, ep.title, ep.description, ep.start_time, ep.end_time, ep.category
            FROM epg_programs ep
            JOIN epg_channels ec ON ep.epg_channel_id = ec.id
            WHERE ec.channel_id = ?
                AND ep.end_time > NOW()
            ORDER BY ep.start_time
            LIMIT 2
        `, [channel.tvg_id]);

        if (programs.length > 0) {
            const now = new Date();
            for (const prog of programs) {
                if (new Date(prog.start_time) <= now && new Date(prog.end_time) > now) {
                    currentProgram = prog;
                } else if (!currentProgram && !nextProgram) {
                    nextProgram = prog;
                } else if (currentProgram && !nextProgram) {
                    nextProgram = prog;
                }
            }
        }
    }

    res.json({
        success: true,
        data: {
            channel: {
                id: channel.id,
                uuid: channel.uuid,
                name: channel.name,
                streamUrl: channel.stream_url,
                logoUrl: channel.logo_url || channel.tvg_logo,
                tvgId: channel.tvg_id,
                tvgName: channel.tvg_name,
                groupTitle: channel.group_title,
                language: channel.language,
                country: channel.country,
                streamType: channel.stream_type,
                quality: channel.quality,
                isActive: !!channel.is_active,
                isAdult: !!channel.is_adult,
                isFavorite: !!channel.is_favorite,
                metadata: channel.metadata,
                playlist: {
                    id: channel.playlist_id,
                    name: channel.playlist_name
                },
                category: channel.category_id ? {
                    id: channel.category_id,
                    name: channel.category_name
                } : null,
                epg: {
                    current: currentProgram,
                    next: nextProgram
                }
            }
        }
    });
}));

// Atualizar canal
router.put('/:id', authenticate, idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, logoUrl, categoryId, isActive, isAdult } = req.body;

    // Verificar propriedade
    const [channel] = await query(`
        SELECT c.id FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE c.id = ? AND p.user_id = ?
    `, [id, req.user.id]);

    if (!channel) {
        throw Errors.NotFound('Canal');
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
    }

    if (logoUrl !== undefined) {
        updates.push('logo_url = ?');
        values.push(logoUrl);
    }

    if (categoryId !== undefined) {
        updates.push('category_id = ?');
        values.push(categoryId);
    }

    if (isActive !== undefined) {
        updates.push('is_active = ?');
        values.push(isActive);
    }

    if (isAdult !== undefined) {
        updates.push('is_adult = ?');
        values.push(isAdult);
    }

    if (updates.length > 0) {
        values.push(id);
        await query(`UPDATE channels SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    res.json({
        success: true,
        message: 'Canal atualizado com sucesso'
    });
}));

// Obter canais por grupo/categoria
router.get('/group/:groupTitle', authenticate, asyncHandler(async (req, res) => {
    const { groupTitle } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const channels = await query(`
        SELECT
            c.id, c.uuid, c.name, c.stream_url, c.logo_url, c.tvg_id,
            c.stream_type, c.quality,
            EXISTS(SELECT 1 FROM favorites f WHERE f.channel_id = c.id AND f.user_id = ?) as is_favorite
        FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE p.user_id = ? AND c.group_title = ? AND c.is_active = TRUE
        ORDER BY c.name
        LIMIT ? OFFSET ?
    `, [req.user.id, req.user.id, groupTitle, limit, offset]);

    const [{ total }] = await query(`
        SELECT COUNT(*) as total FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE p.user_id = ? AND c.group_title = ? AND c.is_active = TRUE
    `, [req.user.id, groupTitle]);

    res.json({
        success: true,
        data: {
            groupTitle,
            channels: channels.map(ch => ({
                ...ch,
                isFavorite: !!ch.is_favorite
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        }
    });
}));

export default router;

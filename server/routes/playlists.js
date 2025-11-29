import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../database/connection.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { authenticate, checkPlanLimit } from '../middleware/auth.js';
import { playlistValidators, paginationValidator, idValidator } from '../middleware/validators.js';
import { uploadPlaylist, deleteFile } from '../middleware/upload.js';
import { logActivity } from '../middleware/logger.js';
import m3uParser from '../services/m3uParser.js';

const router = express.Router();

// Listar playlists do usuário
router.get('/', authenticate, paginationValidator, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const playlists = await query(`
        SELECT
            p.id, p.uuid, p.name, p.description, p.source_type, p.source_url,
            p.is_active, p.auto_update, p.update_interval, p.channel_count,
            p.sync_status, p.last_sync_at, p.created_at, p.updated_at
        FROM playlists p
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
    `, [req.user.id, limit, offset]);

    const [{ total }] = await query(
        'SELECT COUNT(*) as total FROM playlists WHERE user_id = ?',
        [req.user.id]
    );

    res.json({
        success: true,
        data: {
            playlists,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        }
    });
}));

// Obter playlist específica
router.get('/:id', authenticate, idValidator, asyncHandler(async (req, res) => {
    const [playlist] = await query(`
        SELECT
            p.id, p.uuid, p.name, p.description, p.source_type, p.source_url,
            p.is_active, p.auto_update, p.update_interval, p.channel_count,
            p.sync_status, p.sync_error, p.last_sync_at, p.created_at, p.updated_at
        FROM playlists p
        WHERE p.id = ? AND p.user_id = ?
    `, [req.params.id, req.user.id]);

    if (!playlist) {
        throw Errors.NotFound('Playlist');
    }

    // Buscar contagem por categoria
    const categories = await query(`
        SELECT c.name, c.slug, COUNT(ch.id) as channel_count
        FROM categories c
        LEFT JOIN channels ch ON ch.category_id = c.id AND ch.playlist_id = ?
        WHERE c.playlist_id = ? OR c.user_id IS NULL
        GROUP BY c.id
        HAVING channel_count > 0
        ORDER BY c.name
    `, [playlist.id, playlist.id]);

    res.json({
        success: true,
        data: {
            playlist,
            categories
        }
    });
}));

// Criar playlist por URL
router.post('/url', authenticate, checkPlanLimit('playlists'), playlistValidators.create, asyncHandler(async (req, res) => {
    const { name, description, sourceUrl, autoUpdate, updateInterval } = req.body;

    console.log(`[Playlist] Iniciando importação: ${name}`);
    console.log(`[Playlist] URL: ${sourceUrl}`);

    // Validar e fazer parse da playlist
    let parseResult;
    try {
        console.log('[Playlist] Baixando e parseando playlist...');
        parseResult = await m3uParser.parseFromUrl(sourceUrl);
        console.log(`[Playlist] Parse concluído: ${parseResult.totalChannels} canais, ${parseResult.totalCategories} categorias`);
    } catch (error) {
        console.error('[Playlist] Erro no parse:', error.message);
        throw Errors.BadRequest(`Erro ao processar playlist: ${error.message}`);
    }

    const uuid = uuidv4();

    // Usar transação para inserir playlist e canais
    const result = await transaction(async (conn) => {
        // Inserir playlist
        const [playlistResult] = await conn.execute(`
            INSERT INTO playlists (uuid, user_id, name, description, source_type, source_url, auto_update, update_interval, channel_count, sync_status, last_sync_at)
            VALUES (?, ?, ?, ?, 'url', ?, ?, ?, ?, 'success', NOW())
        `, [uuid, req.user.id, name, description || null, sourceUrl, autoUpdate !== false, updateInterval || 24, parseResult.totalChannels]);

        const playlistId = playlistResult.insertId;
        console.log(`[Playlist] Playlist criada com ID: ${playlistId}`);

        // Inserir categorias
        const categoryMap = new Map();
        console.log(`[Playlist] Inserindo ${parseResult.categories.length} categorias...`);

        for (const categoryName of parseResult.categories) {
            const slug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

            const [catResult] = await conn.execute(`
                INSERT INTO categories (user_id, playlist_id, name, slug)
                VALUES (?, ?, ?, ?)
            `, [req.user.id, playlistId, categoryName, slug]);

            categoryMap.set(categoryName, catResult.insertId);
        }

        // Inserir canais em lotes usando INSERT múltiplo (muito mais rápido)
        console.log(`[Playlist] Inserindo ${parseResult.channels.length} canais...`);
        const BATCH_SIZE = 500; // Lotes maiores para playlists grandes
        let inserted = 0;

        for (let i = 0; i < parseResult.channels.length; i += BATCH_SIZE) {
            const batch = parseResult.channels.slice(i, i + BATCH_SIZE);

            if (batch.length > 0) {
                // Construir INSERT múltiplo
                const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
                const values = [];

                for (const channel of batch) {
                    const channelUuid = uuidv4();
                    const categoryId = channel.groupTitle ? categoryMap.get(channel.groupTitle) : null;

                    values.push(
                        channelUuid,
                        playlistId,
                        categoryId,
                        channel.name,
                        channel.streamUrl,
                        channel.tvgLogo || null,
                        channel.tvgId || null,
                        channel.tvgName || null,
                        channel.tvgLogo || null,
                        channel.groupTitle || null,
                        channel.language || null,
                        channel.country || null,
                        channel.streamType,
                        channel.isAdult ? 1 : 0,
                        channel.quality || null
                    );
                }

                await conn.execute(`
                    INSERT INTO channels (uuid, playlist_id, category_id, name, stream_url, logo_url, tvg_id, tvg_name, tvg_logo, group_title, language, country, stream_type, is_adult, quality)
                    VALUES ${placeholders}
                `, values);
            }

            inserted += batch.length;
            if (inserted % 500 === 0 || inserted === parseResult.channels.length) {
                console.log(`[Playlist] Progresso: ${inserted}/${parseResult.channels.length} canais inseridos`);
            }
        }

        return playlistId;
    });

    console.log(`[Playlist] Importação concluída com sucesso!`);
    await logActivity(req.user.id, 'playlist.create', 'playlist', result, null, { name, sourceUrl }, req);

    res.status(201).json({
        success: true,
        message: 'Playlist criada com sucesso',
        data: {
            playlistId: result,
            uuid,
            channelsImported: parseResult.totalChannels,
            categoriesImported: parseResult.totalCategories
        }
    });
}));

// Criar playlist por upload de arquivo
router.post('/upload', authenticate, checkPlanLimit('playlists'), uploadPlaylist, asyncHandler(async (req, res) => {
    if (!req.file) {
        throw Errors.BadRequest('Nenhum arquivo enviado');
    }

    const name = req.body.name || req.file.originalname.replace(/\.[^.]+$/, '');
    const description = req.body.description || null;

    // Parse do arquivo
    let parseResult;
    try {
        parseResult = await m3uParser.parseFromFile(req.file.path);
    } catch (error) {
        await deleteFile(req.file.path).catch(() => {});
        throw Errors.BadRequest(`Erro ao processar arquivo: ${error.message}`);
    }

    const uuid = uuidv4();

    // Usar transação
    const result = await transaction(async (conn) => {
        // Inserir playlist
        const [playlistResult] = await conn.execute(`
            INSERT INTO playlists (uuid, user_id, name, description, source_type, file_path, auto_update, channel_count, sync_status, last_sync_at)
            VALUES (?, ?, ?, ?, 'file', ?, FALSE, ?, 'success', NOW())
        `, [uuid, req.user.id, name, description, req.file.path, parseResult.totalChannels]);

        const playlistId = playlistResult.insertId;

        // Inserir categorias
        const categoryMap = new Map();

        for (const categoryName of parseResult.categories) {
            const slug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

            const [catResult] = await conn.execute(`
                INSERT INTO categories (user_id, playlist_id, name, slug)
                VALUES (?, ?, ?, ?)
            `, [req.user.id, playlistId, categoryName, slug]);

            categoryMap.set(categoryName, catResult.insertId);
        }

        // Inserir canais
        for (const channel of parseResult.channels) {
            const channelUuid = uuidv4();
            const categoryId = channel.groupTitle ? categoryMap.get(channel.groupTitle) : null;

            await conn.execute(`
                INSERT INTO channels (uuid, playlist_id, category_id, name, stream_url, logo_url, tvg_id, tvg_name, tvg_logo, group_title, language, country, stream_type, is_adult, quality)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                channelUuid,
                playlistId,
                categoryId,
                channel.name,
                channel.streamUrl,
                channel.tvgLogo || null,
                channel.tvgId || null,
                channel.tvgName || null,
                channel.tvgLogo || null,
                channel.groupTitle || null,
                channel.language || null,
                channel.country || null,
                channel.streamType,
                channel.isAdult,
                channel.quality || null
            ]);
        }

        return playlistId;
    });

    await logActivity(req.user.id, 'playlist.upload', 'playlist', result, null, { name }, req);

    res.status(201).json({
        success: true,
        message: 'Playlist importada com sucesso',
        data: {
            playlistId: result,
            uuid,
            channelsImported: parseResult.totalChannels,
            categoriesImported: parseResult.totalCategories
        }
    });
}));

// Atualizar playlist
router.put('/:id', authenticate, playlistValidators.update, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, autoUpdate, updateInterval, isActive } = req.body;

    // Verificar propriedade
    const [playlist] = await query(
        'SELECT id FROM playlists WHERE id = ? AND user_id = ?',
        [id, req.user.id]
    );

    if (!playlist) {
        throw Errors.NotFound('Playlist');
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
    }

    if (description !== undefined) {
        updates.push('description = ?');
        values.push(description);
    }

    if (autoUpdate !== undefined) {
        updates.push('auto_update = ?');
        values.push(autoUpdate);
    }

    if (updateInterval !== undefined) {
        updates.push('update_interval = ?');
        values.push(updateInterval);
    }

    if (isActive !== undefined) {
        updates.push('is_active = ?');
        values.push(isActive);
    }

    if (updates.length > 0) {
        values.push(id);
        await query(`UPDATE playlists SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    await logActivity(req.user.id, 'playlist.update', 'playlist', id, null, req.body, req);

    res.json({
        success: true,
        message: 'Playlist atualizada com sucesso'
    });
}));

// Sincronizar playlist (atualizar canais)
router.post('/:id/sync', authenticate, idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [playlist] = await query(
        'SELECT id, source_type, source_url, file_path FROM playlists WHERE id = ? AND user_id = ?',
        [id, req.user.id]
    );

    if (!playlist) {
        throw Errors.NotFound('Playlist');
    }

    if (playlist.source_type !== 'url') {
        throw Errors.BadRequest('Apenas playlists por URL podem ser sincronizadas');
    }

    // Marcar como sincronizando
    await query('UPDATE playlists SET sync_status = ? WHERE id = ?', ['syncing', id]);

    try {
        // Fazer parse
        const parseResult = await m3uParser.parseFromUrl(playlist.source_url);

        // Deletar canais e categorias antigos
        await query('DELETE FROM channels WHERE playlist_id = ?', [id]);
        await query('DELETE FROM categories WHERE playlist_id = ?', [id]);

        // Reinserir
        const categoryMap = new Map();

        for (const categoryName of parseResult.categories) {
            const slug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

            const result = await query(`
                INSERT INTO categories (user_id, playlist_id, name, slug)
                VALUES (?, ?, ?, ?)
            `, [req.user.id, id, categoryName, slug]);

            categoryMap.set(categoryName, result.insertId);
        }

        for (const channel of parseResult.channels) {
            const channelUuid = uuidv4();
            const categoryId = channel.groupTitle ? categoryMap.get(channel.groupTitle) : null;

            await query(`
                INSERT INTO channels (uuid, playlist_id, category_id, name, stream_url, logo_url, tvg_id, tvg_name, tvg_logo, group_title, language, country, stream_type, is_adult, quality)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                channelUuid,
                id,
                categoryId,
                channel.name,
                channel.streamUrl,
                channel.tvgLogo || null,
                channel.tvgId || null,
                channel.tvgName || null,
                channel.tvgLogo || null,
                channel.groupTitle || null,
                channel.language || null,
                channel.country || null,
                channel.streamType,
                channel.isAdult,
                channel.quality || null
            ]);
        }

        // Atualizar status
        await query(`
            UPDATE playlists SET sync_status = 'success', sync_error = NULL, channel_count = ?, last_sync_at = NOW()
            WHERE id = ?
        `, [parseResult.totalChannels, id]);

        res.json({
            success: true,
            message: 'Playlist sincronizada com sucesso',
            data: {
                channelsImported: parseResult.totalChannels,
                categoriesImported: parseResult.totalCategories
            }
        });

    } catch (error) {
        await query('UPDATE playlists SET sync_status = ?, sync_error = ? WHERE id = ?', ['error', error.message, id]);
        throw error;
    }
}));

// Deletar playlist
router.delete('/:id', authenticate, idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [playlist] = await query(
        'SELECT id, file_path FROM playlists WHERE id = ? AND user_id = ?',
        [id, req.user.id]
    );

    if (!playlist) {
        throw Errors.NotFound('Playlist');
    }

    // Deletar arquivo se existir
    if (playlist.file_path) {
        await deleteFile(playlist.file_path).catch(console.error);
    }

    // Deletar playlist (cascade deleta canais e categorias)
    await query('DELETE FROM playlists WHERE id = ?', [id]);

    await logActivity(req.user.id, 'playlist.delete', 'playlist', id, null, null, req);

    res.json({
        success: true,
        message: 'Playlist deletada com sucesso'
    });
}));

// Exportar playlist como M3U
router.get('/:id/export', authenticate, idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [playlist] = await query(
        'SELECT id, name FROM playlists WHERE id = ? AND user_id = ?',
        [id, req.user.id]
    );

    if (!playlist) {
        throw Errors.NotFound('Playlist');
    }

    const channels = await query(`
        SELECT name, stream_url as streamUrl, tvg_id as tvgId, tvg_name as tvgName, tvg_logo as tvgLogo, group_title as groupTitle
        FROM channels WHERE playlist_id = ? ORDER BY group_title, name
    `, [id]);

    const m3uContent = M3UParser.generate(channels);

    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.setHeader('Content-Disposition', `attachment; filename="${playlist.name}.m3u"`);
    res.send(m3uContent);
}));

export default router;

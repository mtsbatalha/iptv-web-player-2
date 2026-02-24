import express from 'express';
import { query, transaction } from '../database/connection.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { authenticate, requirePlanFeature } from '../middleware/auth.js';
import { epgValidators, idValidator } from '../middleware/validators.js';
import { logActivity, logSystem } from '../middleware/logger.js';
import epgParser from '../services/epgParser.js';

const router = express.Router();

// Listar fontes de EPG
router.get('/sources', authenticate, requirePlanFeature('epg'), asyncHandler(async (req, res) => {
    const sources = await query(`
        SELECT
            id, name, url, is_active, auto_update, update_interval,
            sync_status, sync_error, program_count, last_updated_at, created_at
        FROM epg_sources
        WHERE user_id = ? OR user_id IS NULL
        ORDER BY name
    `, [req.user.id]);

    res.json({
        success: true,
        data: { sources }
    });
}));

// Adicionar fonte de EPG
router.post('/sources', authenticate, requirePlanFeature('epg'), epgValidators.addSource, asyncHandler(async (req, res) => {
    const { name, url, autoUpdate, updateInterval } = req.body;

    const result = await query(`
        INSERT INTO epg_sources (user_id, name, url, auto_update, update_interval)
        VALUES (?, ?, ?, ?, ?)
    `, [req.user.id, name, url, autoUpdate !== false, updateInterval || 6]);

    await logActivity(req.user.id, 'epg.add_source', 'epg_source', result.insertId, null, { name, url }, req);

    res.status(201).json({
        success: true,
        message: 'Fonte de EPG adicionada',
        data: {
            id: result.insertId
        }
    });
}));

// Sincronizar fonte de EPG
router.post('/sources/:id/sync', authenticate, requirePlanFeature('epg'), idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [source] = await query(
        'SELECT id, url FROM epg_sources WHERE id = ? AND (user_id = ? OR user_id IS NULL)',
        [id, req.user.id]
    );

    if (!source) {
        throw Errors.NotFound('Fonte de EPG');
    }

    // Marcar como sincronizando
    await query('UPDATE epg_sources SET sync_status = ? WHERE id = ?', ['syncing', id]);

    try {
        // Parse do EPG
        const parseResult = await epgParser.parseFromUrl(source.url);

        // Usar transação
        await transaction(async (conn) => {
            // Limpar dados antigos
            await conn.execute('DELETE FROM epg_channels WHERE epg_source_id = ?', [id]);

            // Inserir canais
            const channelIdMap = new Map();

            for (const channel of parseResult.channels) {
                const [result] = await conn.execute(`
                    INSERT INTO epg_channels (epg_source_id, channel_id, display_name, icon_url, language)
                    VALUES (?, ?, ?, ?, ?)
                `, [id, channel.channelId, channel.displayName, channel.iconUrl || null, channel.language || null]);

                channelIdMap.set(channel.channelId, result.insertId);
            }

            // Inserir programas em lotes
            const batchSize = 500;
            for (let i = 0; i < parseResult.programs.length; i += batchSize) {
                const batch = parseResult.programs.slice(i, i + batchSize);

                for (const program of batch) {
                    const epgChannelId = channelIdMap.get(program.channelId);

                    if (!epgChannelId) continue;

                    await conn.execute(`
                        INSERT INTO epg_programs (
                            epg_channel_id, title, subtitle, description, category,
                            start_time, end_time, duration, episode_num, season_num,
                            year, rating, icon_url, is_live, is_new, is_premiere, language
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        epgChannelId,
                        program.title,
                        program.subtitle || null,
                        program.description || null,
                        program.category || null,
                        program.startTime,
                        program.endTime,
                        program.duration,
                        program.episodeNum || null,
                        program.seasonNum || null,
                        program.year || null,
                        program.rating || null,
                        program.iconUrl || null,
                        program.isLive,
                        program.isNew,
                        program.isPremiere,
                        program.language || null
                    ]);
                }
            }
        });

        // Atualizar status
        await query(`
            UPDATE epg_sources
            SET sync_status = 'success', sync_error = NULL, program_count = ?, last_updated_at = NOW()
            WHERE id = ?
        `, [parseResult.totalPrograms, id]);

        await logSystem('info', 'epg', `EPG sincronizado manualmente`, { id, programs: parseResult.totalPrograms, channels: parseResult.totalChannels, userId: req.user.id });

        res.json({
            success: true,
            message: 'EPG sincronizado com sucesso',
            data: {
                channelsImported: parseResult.totalChannels,
                programsImported: parseResult.totalPrograms
            }
        });

    } catch (error) {
        await query('UPDATE epg_sources SET sync_status = ?, sync_error = ? WHERE id = ?', ['error', error.message, id]);
        await logSystem('error', 'epg', `Falha ao sincronizar EPG`, { id, error: error.message, userId: req.user.id });
        throw error;
    }
}));

// Deletar fonte de EPG
router.delete('/sources/:id', authenticate, idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [source] = await query(
        'SELECT id FROM epg_sources WHERE id = ? AND user_id = ?',
        [id, req.user.id]
    );

    if (!source) {
        throw Errors.NotFound('Fonte de EPG');
    }

    await query('DELETE FROM epg_sources WHERE id = ?', [id]);

    res.json({
        success: true,
        message: 'Fonte de EPG removida'
    });
}));

// Obter grade de programação de um canal
router.get('/guide/:channelId', authenticate, requirePlanFeature('epg'), asyncHandler(async (req, res) => {
    const { channelId } = req.params;
    const { date } = req.query;

    // Buscar canal
    const [channel] = await query(`
        SELECT c.id, c.name, c.tvg_id, c.logo_url
        FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE c.id = ? AND p.user_id = ?
    `, [channelId, req.user.id]);

    if (!channel) {
        throw Errors.NotFound('Canal');
    }

    if (!channel.tvg_id) {
        return res.json({
            success: true,
            data: {
                channel,
                programs: [],
                message: 'Canal não possui EPG configurado'
            }
        });
    }

    // Definir período
    let startDate, endDate;
    if (date) {
        startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
    } else {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
    }

    // Buscar programas
    const programs = await query(`
        SELECT
            ep.id, ep.title, ep.subtitle, ep.description, ep.category,
            ep.start_time, ep.end_time, ep.duration, ep.episode_num, ep.season_num,
            ep.year, ep.rating, ep.icon_url, ep.is_live, ep.is_new, ep.is_premiere
        FROM epg_programs ep
        JOIN epg_channels ec ON ep.epg_channel_id = ec.id
        WHERE ec.channel_id = ?
            AND ep.start_time >= ? AND ep.start_time <= ?
        ORDER BY ep.start_time
    `, [channel.tvg_id, startDate, endDate]);

    // Identificar programa atual
    const now = new Date();
    const programsWithStatus = programs.map(p => ({
        ...p,
        isCurrent: new Date(p.start_time) <= now && new Date(p.end_time) > now,
        progress: new Date(p.start_time) <= now && new Date(p.end_time) > now
            ? Math.round(((now - new Date(p.start_time)) / (new Date(p.end_time) - new Date(p.start_time))) * 100)
            : 0
    }));

    res.json({
        success: true,
        data: {
            channel: {
                id: channel.id,
                name: channel.name,
                logoUrl: channel.logo_url
            },
            date: startDate.toISOString().split('T')[0],
            programs: programsWithStatus
        }
    });
}));

// Obter programa atual e próximo de um canal
router.get('/now/:channelId', authenticate, requirePlanFeature('epg'), asyncHandler(async (req, res) => {
    const { channelId } = req.params;

    const [channel] = await query(`
        SELECT c.tvg_id FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE c.id = ? AND p.user_id = ?
    `, [channelId, req.user.id]);

    if (!channel || !channel.tvg_id) {
        return res.json({
            success: true,
            data: { current: null, next: null }
        });
    }

    const now = new Date();

    // Programa atual
    const [current] = await query(`
        SELECT
            ep.id, ep.title, ep.subtitle, ep.description, ep.category,
            ep.start_time, ep.end_time, ep.duration, ep.icon_url
        FROM epg_programs ep
        JOIN epg_channels ec ON ep.epg_channel_id = ec.id
        WHERE ec.channel_id = ?
            AND ep.start_time <= ? AND ep.end_time > ?
        LIMIT 1
    `, [channel.tvg_id, now, now]);

    // Próximo programa
    const [next] = await query(`
        SELECT
            ep.id, ep.title, ep.subtitle, ep.start_time, ep.end_time, ep.duration
        FROM epg_programs ep
        JOIN epg_channels ec ON ep.epg_channel_id = ec.id
        WHERE ec.channel_id = ?
            AND ep.start_time > ?
        ORDER BY ep.start_time
        LIMIT 1
    `, [channel.tvg_id, now]);

    // Calcular progresso do programa atual
    let progress = 0;
    if (current) {
        const start = new Date(current.start_time);
        const end = new Date(current.end_time);
        progress = Math.round(((now - start) / (end - start)) * 100);
    }

    res.json({
        success: true,
        data: {
            current: current ? { ...current, progress } : null,
            next: next || null
        }
    });
}));

// Buscar programas
router.get('/search', authenticate, requirePlanFeature('epg'), asyncHandler(async (req, res) => {
    const { q, category, date, limit = 50 } = req.query;

    if (!q && !category) {
        return res.json({
            success: true,
            data: { programs: [] }
        });
    }

    let sql = `
        SELECT
            ep.id, ep.title, ep.subtitle, ep.description, ep.category,
            ep.start_time, ep.end_time, ep.duration, ep.icon_url,
            ec.channel_id as tvg_id, ec.display_name as channel_name
        FROM epg_programs ep
        JOIN epg_channels ec ON ep.epg_channel_id = ec.id
        WHERE ep.end_time > NOW()
    `;

    const params = [];

    if (q) {
        sql += ' AND (ep.title LIKE ? OR ep.description LIKE ?)';
        params.push(`%${q}%`, `%${q}%`);
    }

    if (category) {
        sql += ' AND ep.category = ?';
        params.push(category);
    }

    if (date) {
        sql += ' AND DATE(ep.start_time) = ?';
        params.push(date);
    }

    sql += ' ORDER BY ep.start_time LIMIT ?';
    params.push(parseInt(limit));

    const programs = await query(sql, params);

    res.json({
        success: true,
        data: { programs }
    });
}));

// Mapear canal com EPG
router.post('/mapping', authenticate, requirePlanFeature('epg'), asyncHandler(async (req, res) => {
    const { channelId, epgChannelId } = req.body;

    // Verificar propriedade do canal
    const [channel] = await query(`
        SELECT c.id FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE c.id = ? AND p.user_id = ?
    `, [channelId, req.user.id]);

    if (!channel) {
        throw Errors.NotFound('Canal');
    }

    // Atualizar tvg_id do canal
    const [epgChannel] = await query('SELECT channel_id FROM epg_channels WHERE id = ?', [epgChannelId]);

    if (!epgChannel) {
        throw Errors.NotFound('Canal EPG');
    }

    await query('UPDATE channels SET tvg_id = ? WHERE id = ?', [epgChannel.channel_id, channelId]);

    // Registrar mapeamento
    await query(`
        INSERT INTO channel_epg_mapping (channel_id, epg_channel_id, is_auto_mapped)
        VALUES (?, ?, FALSE)
        ON DUPLICATE KEY UPDATE epg_channel_id = ?
    `, [channelId, epgChannelId, epgChannelId]);

    res.json({
        success: true,
        message: 'Canal mapeado com sucesso'
    });
}));

// Auto-mapear canais com EPG
router.post('/auto-map', authenticate, requirePlanFeature('epg'), asyncHandler(async (req, res) => {
    const { playlistId } = req.body;

    // Buscar canais sem EPG
    const channels = await query(`
        SELECT c.id, c.name, c.tvg_id, c.tvg_name
        FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE p.user_id = ? ${playlistId ? 'AND p.id = ?' : ''}
            AND (c.tvg_id IS NULL OR c.tvg_id = '')
    `, playlistId ? [req.user.id, playlistId] : [req.user.id]);

    // Buscar canais EPG disponíveis
    const epgChannels = await query('SELECT id, channel_id, display_name FROM epg_channels');

    let mappedCount = 0;

    for (const channel of channels) {
        const searchTerms = [channel.name, channel.tvg_name].filter(Boolean);

        for (const term of searchTerms) {
            const normalizedTerm = term.toLowerCase().replace(/[^a-z0-9]/g, '');

            const match = epgChannels.find(ec => {
                const normalizedName = ec.display_name.toLowerCase().replace(/[^a-z0-9]/g, '');
                return normalizedName === normalizedTerm ||
                       normalizedName.includes(normalizedTerm) ||
                       normalizedTerm.includes(normalizedName);
            });

            if (match) {
                await query('UPDATE channels SET tvg_id = ? WHERE id = ?', [match.channel_id, channel.id]);

                await query(`
                    INSERT INTO channel_epg_mapping (channel_id, epg_channel_id, is_auto_mapped, confidence_score)
                    VALUES (?, ?, TRUE, 0.8)
                    ON DUPLICATE KEY UPDATE epg_channel_id = ?, is_auto_mapped = TRUE
                `, [channel.id, match.id, match.id]);

                mappedCount++;
                break;
            }
        }
    }

    res.json({
        success: true,
        message: `${mappedCount} canais mapeados automaticamente`,
        data: { mappedCount }
    });
}));

export default router;

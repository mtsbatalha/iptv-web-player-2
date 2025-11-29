import cron from 'node-cron';
import { query, transaction } from '../database/connection.js';
import { logSystem } from '../middleware/logger.js';
import m3uParser from '../services/m3uParser.js';
import epgParser from '../services/epgParser.js';
import { v4 as uuidv4 } from 'uuid';

console.log('🔄 Iniciando scheduler de jobs...');

// Job: Atualizar playlists (a cada hora)
cron.schedule('0 * * * *', async () => {
    console.log('[JOB] Verificando playlists para atualização...');

    try {
        // Buscar playlists que precisam de atualização
        const playlists = await query(`
            SELECT id, name, source_url, update_interval, last_sync_at
            FROM playlists
            WHERE source_type = 'url'
                AND auto_update = TRUE
                AND is_active = TRUE
                AND (
                    last_sync_at IS NULL
                    OR TIMESTAMPDIFF(HOUR, last_sync_at, NOW()) >= update_interval
                )
            LIMIT 10
        `);

        console.log(`[JOB] ${playlists.length} playlists para atualizar`);

        for (const playlist of playlists) {
            await updatePlaylist(playlist);
        }

    } catch (error) {
        console.error('[JOB] Erro ao atualizar playlists:', error);
        await logSystem('error', 'jobs', 'Erro ao atualizar playlists', { error: error.message });
    }
});

// Job: Atualizar EPG (a cada 6 horas)
cron.schedule('0 */6 * * *', async () => {
    console.log('[JOB] Verificando fontes de EPG para atualização...');

    try {
        const sources = await query(`
            SELECT id, name, url, update_interval, last_updated_at
            FROM epg_sources
            WHERE auto_update = TRUE
                AND is_active = TRUE
                AND (
                    last_updated_at IS NULL
                    OR TIMESTAMPDIFF(HOUR, last_updated_at, NOW()) >= update_interval
                )
            LIMIT 5
        `);

        console.log(`[JOB] ${sources.length} fontes de EPG para atualizar`);

        for (const source of sources) {
            await updateEpgSource(source);
        }

    } catch (error) {
        console.error('[JOB] Erro ao atualizar EPG:', error);
        await logSystem('error', 'jobs', 'Erro ao atualizar EPG', { error: error.message });
    }
});

// Job: Limpar programas EPG antigos (diariamente às 3h)
cron.schedule('0 3 * * *', async () => {
    console.log('[JOB] Limpando programas EPG antigos...');

    try {
        const result = await query(`
            DELETE FROM epg_programs
            WHERE end_time < DATE_SUB(NOW(), INTERVAL 7 DAY)
        `);

        console.log(`[JOB] ${result.affectedRows} programas EPG removidos`);
        await logSystem('info', 'jobs', 'Limpeza de EPG concluída', { removed: result.affectedRows });

    } catch (error) {
        console.error('[JOB] Erro ao limpar EPG:', error);
    }
});

// Job: Limpar histórico antigo (semanalmente aos domingos às 4h)
cron.schedule('0 4 * * 0', async () => {
    console.log('[JOB] Limpando histórico antigo...');

    try {
        const result = await query(`
            DELETE FROM watch_history
            WHERE watched_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
        `);

        console.log(`[JOB] ${result.affectedRows} registros de histórico removidos`);

    } catch (error) {
        console.error('[JOB] Erro ao limpar histórico:', error);
    }
});

// Job: Limpar tokens expirados (diariamente às 2h)
cron.schedule('0 2 * * *', async () => {
    console.log('[JOB] Limpando tokens expirados...');

    try {
        const result = await query(`
            DELETE FROM refresh_tokens
            WHERE expires_at < NOW() OR revoked_at IS NOT NULL
        `);

        console.log(`[JOB] ${result.affectedRows} tokens removidos`);

    } catch (error) {
        console.error('[JOB] Erro ao limpar tokens:', error);
    }
});

// Job: Limpar logs antigos (mensalmente no dia 1 às 5h)
cron.schedule('0 5 1 * *', async () => {
    console.log('[JOB] Limpando logs antigos...');

    try {
        await query(`
            DELETE FROM activity_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH)
        `);

        await query(`
            DELETE FROM system_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 3 MONTH)
        `);

        console.log('[JOB] Logs antigos removidos');

    } catch (error) {
        console.error('[JOB] Erro ao limpar logs:', error);
    }
});

// Job: Verificar gravações agendadas (a cada minuto)
cron.schedule('* * * * *', async () => {
    try {
        // Buscar gravações que devem iniciar agora
        const recordings = await query(`
            SELECT r.id, r.channel_id, r.title, c.stream_url
            FROM recordings r
            JOIN channels c ON r.channel_id = c.id
            WHERE r.status = 'scheduled'
                AND r.start_time <= NOW()
                AND r.end_time > NOW()
        `);

        for (const recording of recordings) {
            await startRecording(recording);
        }

        // Verificar gravações que devem terminar
        const endingRecordings = await query(`
            SELECT id FROM recordings
            WHERE status = 'recording' AND end_time <= NOW()
        `);

        for (const recording of endingRecordings) {
            await stopRecording(recording.id);
        }

    } catch (error) {
        console.error('[JOB] Erro ao verificar gravações:', error);
    }
});

// Função para atualizar playlist
async function updatePlaylist(playlist) {
    console.log(`[JOB] Atualizando playlist: ${playlist.name}`);

    try {
        await query('UPDATE playlists SET sync_status = ? WHERE id = ?', ['syncing', playlist.id]);

        const parseResult = await m3uParser.parseFromUrl(playlist.source_url);

        await transaction(async (conn) => {
            // Deletar canais antigos
            await conn.execute('DELETE FROM channels WHERE playlist_id = ?', [playlist.id]);
            await conn.execute('DELETE FROM categories WHERE playlist_id = ?', [playlist.id]);

            // Reinserir categorias
            const categoryMap = new Map();

            for (const categoryName of parseResult.categories) {
                const slug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                const [result] = await conn.execute(`
                    INSERT INTO categories (playlist_id, name, slug)
                    VALUES (?, ?, ?)
                `, [playlist.id, categoryName, slug]);

                categoryMap.set(categoryName, result.insertId);
            }

            // Reinserir canais
            for (const channel of parseResult.channels) {
                const channelUuid = uuidv4();
                const categoryId = channel.groupTitle ? categoryMap.get(channel.groupTitle) : null;

                await conn.execute(`
                    INSERT INTO channels (uuid, playlist_id, category_id, name, stream_url, logo_url, tvg_id, tvg_name, tvg_logo, group_title, stream_type, is_adult, quality)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    channelUuid, playlist.id, categoryId, channel.name, channel.streamUrl,
                    channel.tvgLogo || null, channel.tvgId || null, channel.tvgName || null,
                    channel.tvgLogo || null, channel.groupTitle || null, channel.streamType,
                    channel.isAdult, channel.quality || null
                ]);
            }
        });

        await query(`
            UPDATE playlists
            SET sync_status = 'success', sync_error = NULL, channel_count = ?, last_sync_at = NOW()
            WHERE id = ?
        `, [parseResult.totalChannels, playlist.id]);

        console.log(`[JOB] Playlist ${playlist.name} atualizada: ${parseResult.totalChannels} canais`);

    } catch (error) {
        console.error(`[JOB] Erro ao atualizar playlist ${playlist.name}:`, error.message);
        await query('UPDATE playlists SET sync_status = ?, sync_error = ? WHERE id = ?', ['error', error.message, playlist.id]);
    }
}

// Função para atualizar fonte de EPG
async function updateEpgSource(source) {
    console.log(`[JOB] Atualizando EPG: ${source.name}`);

    try {
        await query('UPDATE epg_sources SET sync_status = ? WHERE id = ?', ['syncing', source.id]);

        const parseResult = await epgParser.parseFromUrl(source.url);

        await transaction(async (conn) => {
            await conn.execute('DELETE FROM epg_channels WHERE epg_source_id = ?', [source.id]);

            const channelIdMap = new Map();

            for (const channel of parseResult.channels) {
                const [result] = await conn.execute(`
                    INSERT INTO epg_channels (epg_source_id, channel_id, display_name, icon_url, language)
                    VALUES (?, ?, ?, ?, ?)
                `, [source.id, channel.channelId, channel.displayName, channel.iconUrl || null, channel.language || null]);

                channelIdMap.set(channel.channelId, result.insertId);
            }

            // Inserir programas em lotes
            for (let i = 0; i < parseResult.programs.length; i += 500) {
                const batch = parseResult.programs.slice(i, i + 500);

                for (const program of batch) {
                    const epgChannelId = channelIdMap.get(program.channelId);
                    if (!epgChannelId) continue;

                    await conn.execute(`
                        INSERT INTO epg_programs (epg_channel_id, title, subtitle, description, category, start_time, end_time, duration, episode_num, season_num, year, rating, icon_url, is_live, is_new, is_premiere, language)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        epgChannelId, program.title, program.subtitle || null, program.description || null,
                        program.category || null, program.startTime, program.endTime, program.duration,
                        program.episodeNum || null, program.seasonNum || null, program.year || null,
                        program.rating || null, program.iconUrl || null, program.isLive, program.isNew,
                        program.isPremiere, program.language || null
                    ]);
                }
            }
        });

        await query(`
            UPDATE epg_sources
            SET sync_status = 'success', sync_error = NULL, program_count = ?, last_updated_at = NOW()
            WHERE id = ?
        `, [parseResult.totalPrograms, source.id]);

        console.log(`[JOB] EPG ${source.name} atualizado: ${parseResult.totalPrograms} programas`);

    } catch (error) {
        console.error(`[JOB] Erro ao atualizar EPG ${source.name}:`, error.message);
        await query('UPDATE epg_sources SET sync_status = ?, sync_error = ? WHERE id = ?', ['error', error.message, source.id]);
    }
}

// Função para iniciar gravação
async function startRecording(recording) {
    console.log(`[JOB] Iniciando gravação: ${recording.title}`);

    try {
        await query(`
            UPDATE recordings
            SET status = 'recording', actual_start_time = NOW()
            WHERE id = ?
        `, [recording.id]);

        // TODO: Iniciar processo FFmpeg real aqui
        // const outputPath = `recordings/${recording.id}_${Date.now()}.ts`;
        // ffmpeg -i ${recording.stream_url} -c copy -t duration ${outputPath}

    } catch (error) {
        console.error(`[JOB] Erro ao iniciar gravação:`, error);
        await query('UPDATE recordings SET status = ?, error_message = ? WHERE id = ?', ['failed', error.message, recording.id]);
    }
}

// Função para parar gravação
async function stopRecording(recordingId) {
    console.log(`[JOB] Finalizando gravação: ${recordingId}`);

    try {
        // TODO: Parar processo FFmpeg

        await query(`
            UPDATE recordings
            SET status = 'completed', actual_end_time = NOW(),
                duration = TIMESTAMPDIFF(SECOND, actual_start_time, NOW())
            WHERE id = ?
        `, [recordingId]);

    } catch (error) {
        console.error(`[JOB] Erro ao finalizar gravação:`, error);
    }
}

console.log('✅ Scheduler de jobs iniciado');

export { updatePlaylist, updateEpgSource };

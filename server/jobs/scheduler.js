import cron from 'node-cron';
import { query, transaction } from '../database/connection.js';
import { logSystem } from '../middleware/logger.js';
import m3uParser from '../services/m3uParser.js';
import epgParser from '../services/epgParser.js';
import { v4 as uuidv4 } from 'uuid';

console.log('🔄 Iniciando scheduler de jobs...');

// Job: Resetar playlists travadas em "syncing" (a cada 15 minutos)
// Timeout aumentado para 60 minutos para suportar playlists grandes (100k+ canais)
cron.schedule('*/15 * * * *', async () => {
    console.log('[JOB] Verificando playlists travadas...');

    try {
        // Resetar playlists que estão em "syncing" há mais de 60 minutos
        const stuckPlaylists = await query(`
            UPDATE playlists
            SET sync_status = 'error',
                sync_error = 'Sincronização travada por mais de 60 minutos - resetada automaticamente',
                updated_at = NOW()
            WHERE sync_status = 'syncing'
                AND (
                    (last_sync_at IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 60 MINUTE))
                    OR (last_sync_at IS NOT NULL AND last_sync_at < DATE_SUB(NOW(), INTERVAL 60 MINUTE))
                )
        `);

        if (stuckPlaylists.affectedRows > 0) {
            console.log(`[JOB] ${stuckPlaylists.affectedRows} playlists travadas resetadas`);
            await logSystem('warning', 'jobs', 'Playlists travadas resetadas', { count: stuckPlaylists.affectedRows });
        }

        // Resetar EPG sources travados também (30 minutos)
        const stuckEpg = await query(`
            UPDATE epg_sources
            SET sync_status = 'error',
                sync_error = 'Sincronização travada - resetada automaticamente',
                updated_at = NOW()
            WHERE sync_status = 'syncing'
                AND (
                    (last_updated_at IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE))
                    OR (last_updated_at IS NOT NULL AND last_updated_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE))
                )
        `);

        if (stuckEpg.affectedRows > 0) {
            console.log(`[JOB] ${stuckEpg.affectedRows} fontes EPG travadas resetadas`);
        }

    } catch (error) {
        console.error('[JOB] Erro ao verificar playlists travadas:', error);
    }
});

// Job: Atualizar playlists (a cada hora)
cron.schedule('0 * * * *', async () => {
    console.log('[JOB] Verificando playlists para atualização...');

    try {
        // Buscar playlists que precisam de atualização
        // Playlists com erro usam backoff exponencial: interval * 2^retry_count
        // Máximo de 5 retries para evitar loop infinito
        const playlists = await query(`
            SELECT id, name, source_url, update_interval, last_sync_at, sync_status, sync_retry_count
            FROM playlists
            WHERE source_type = 'url'
                AND auto_update = TRUE
                AND is_active = TRUE
                AND sync_status != 'syncing'
                AND (sync_status != 'error' OR sync_retry_count < 5)
                AND (
                    last_sync_at IS NULL
                    OR (
                        sync_status != 'error'
                        AND TIMESTAMPDIFF(HOUR, last_sync_at, NOW()) >= update_interval
                    )
                    OR (
                        sync_status = 'error'
                        AND TIMESTAMPDIFF(HOUR, last_sync_at, NOW()) >= LEAST(update_interval * POW(2, sync_retry_count), 720)
                    )
                )
            ORDER BY last_sync_at IS NULL DESC, last_sync_at ASC
            LIMIT 10
        `);

        console.log(`[JOB] ${playlists.length} playlists para atualizar`);

        for (const playlist of playlists) {
            console.log(`[JOB] Atualizando: ${playlist.name} (status anterior: ${playlist.sync_status})`);
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
    console.log(`[JOB] Atualizando playlist: ${playlist.name} (ID: ${playlist.id})`);

    try {
        // Marcar como syncing E buscar user_id para usar nas categorias
        const [playlistFull] = await query(
            'SELECT id, user_id, name, source_url FROM playlists WHERE id = ?',
            [playlist.id]
        );

        if (!playlistFull) {
            console.error(`[JOB] Playlist ID ${playlist.id} não encontrada`);
            return;
        }

        await query(`
            UPDATE playlists 
            SET sync_status = 'syncing', last_sync_at = NOW() 
            WHERE id = ?
        `, [playlist.id]);

        // Timeout de 45 minutos para o download/parse de playlists grandes
        const parsePromise = m3uParser.parseFromUrl(playlist.source_url);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout ao baixar playlist (45min)')), 2700000)
        );

        const parseResult = await Promise.race([parsePromise, timeoutPromise]);
        console.log(`[JOB] Parse concluído: ${parseResult.totalChannels} canais, ${parseResult.totalCategories} categorias`);

        if (!parseResult || !parseResult.channels || parseResult.channels.length === 0) {
            throw new Error('Playlist vazia ou sem canais válidos');
        }

        await transaction(async (conn) => {
            // Deletar canais e categorias antigos
            await conn.execute('DELETE FROM channels WHERE playlist_id = ?', [playlist.id]);
            await conn.execute('DELETE FROM categories WHERE playlist_id = ?', [playlist.id]);

            // Reinserir categorias (com user_id)
            const categoryMap = new Map();

            for (const categoryName of parseResult.categories) {
                const slug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                const [result] = await conn.execute(`
                    INSERT INTO categories (user_id, playlist_id, name, slug)
                    VALUES (?, ?, ?, ?)
                `, [playlistFull.user_id, playlist.id, categoryName, slug]);

                categoryMap.set(categoryName, result.insertId);
            }

            // Reinserir canais usando bulk INSERT para máxima performance
            const BATCH_SIZE = 500;
            let inserted = 0;
            console.log(`[JOB] Inserindo ${parseResult.channels.length} canais em lotes de ${BATCH_SIZE}...`);

            for (let i = 0; i < parseResult.channels.length; i += BATCH_SIZE) {
                const batch = parseResult.channels.slice(i, i + BATCH_SIZE);

                if (batch.length > 0) {
                    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
                    const values = [];

                    for (const channel of batch) {
                        const channelUuid = uuidv4();
                        const categoryId = channel.groupTitle ? categoryMap.get(channel.groupTitle) : null;

                        values.push(
                            channelUuid,
                            playlist.id,
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
                if (inserted % 5000 === 0 || inserted === parseResult.channels.length) {
                    console.log(`[JOB] Progresso: ${inserted}/${parseResult.channels.length} canais inseridos`);
                    // Atualizar last_sync_at periodicamente para evitar reset pelo job de stuck
                    await query('UPDATE playlists SET last_sync_at = NOW() WHERE id = ?', [playlist.id]);
                }
            }
        });

        await query(`
            UPDATE playlists
            SET sync_status = 'success', sync_error = NULL, sync_retry_count = 0, channel_count = ?, last_sync_at = NOW()
            WHERE id = ?
        `, [parseResult.totalChannels, playlist.id]);

        console.log(`[JOB] ✅ Playlist "${playlist.name}" atualizada: ${parseResult.totalChannels} canais`);
        await logSystem('info', 'jobs', `Playlist atualizada: ${playlist.name}`, { id: playlist.id, channels: parseResult.totalChannels });

    } catch (error) {
        const retryCount = (playlist.sync_retry_count || 0) + 1;
        console.error(`[JOB] ❌ Erro ao atualizar playlist "${playlist.name}" (retry ${retryCount}/5):`, error.message);
        await query(`
            UPDATE playlists 
            SET sync_status = 'error', sync_error = ?, sync_retry_count = ?, last_sync_at = NOW() 
            WHERE id = ?
        `, [error.message.substring(0, 500), retryCount, playlist.id]);
        await logSystem('error', 'jobs', `Falha ao atualizar playlist: ${playlist.name}`, { id: playlist.id, error: error.message, retryCount });
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
        await logSystem('info', 'jobs', `EPG atualizado: ${source.name}`, { id: source.id, programs: parseResult.totalPrograms, channels: parseResult.totalChannels });

    } catch (error) {
        console.error(`[JOB] Erro ao atualizar EPG ${source.name}:`, error.message);
        await query('UPDATE epg_sources SET sync_status = ?, sync_error = ? WHERE id = ?', ['error', error.message, source.id]);
        await logSystem('error', 'jobs', `Falha ao atualizar EPG: ${source.name}`, { id: source.id, error: error.message });
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

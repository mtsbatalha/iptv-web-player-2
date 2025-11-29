import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { query } from '../database/connection.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { authenticate, requirePlanFeature, checkPlanLimit } from '../middleware/auth.js';
import { recordingValidators, idValidator, paginationValidator } from '../middleware/validators.js';
import { logActivity } from '../middleware/logger.js';
import * as recorder from '../services/recorder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RECORDINGS_DIR = path.join(__dirname, '../../recordings');

const router = express.Router();

// Listar gravações
router.get('/', authenticate, requirePlanFeature('dvr'), paginationValidator, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { status } = req.query;

    let sql = `
        SELECT
            r.id, r.uuid, r.title, r.description, r.status, r.recording_type,
            r.start_time, r.end_time, r.actual_start_time, r.actual_end_time,
            r.duration, r.file_size, r.format, r.quality, r.error_message,
            r.created_at,
            c.id as channel_id, c.name as channel_name, c.logo_url as channel_logo
        FROM recordings r
        JOIN channels c ON r.channel_id = c.id
        WHERE r.user_id = ?
    `;

    const params = [req.user.id];

    if (status) {
        sql += ' AND r.status = ?';
        params.push(status);
    }

    sql += ' ORDER BY r.start_time DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const recordings = await query(sql, params);

    const [{ total }] = await query(
        'SELECT COUNT(*) as total FROM recordings WHERE user_id = ?' + (status ? ' AND status = ?' : ''),
        status ? [req.user.id, status] : [req.user.id]
    );

    res.json({
        success: true,
        data: {
            recordings: recordings.map(r => ({
                id: r.id,
                uuid: r.uuid,
                title: r.title,
                description: r.description,
                status: r.status,
                recordingType: r.recording_type,
                startTime: r.start_time,
                endTime: r.end_time,
                actualStartTime: r.actual_start_time,
                actualEndTime: r.actual_end_time,
                duration: r.duration,
                fileSize: r.file_size,
                format: r.format,
                quality: r.quality,
                errorMessage: r.error_message,
                createdAt: r.created_at,
                channel: {
                    id: r.channel_id,
                    name: r.channel_name,
                    logoUrl: r.channel_logo
                }
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

// Obter gravação específica
router.get('/:id', authenticate, requirePlanFeature('dvr'), idValidator, asyncHandler(async (req, res) => {
    const [recording] = await query(`
        SELECT
            r.*,
            c.name as channel_name, c.logo_url as channel_logo,
            ep.title as program_title, ep.description as program_description
        FROM recordings r
        JOIN channels c ON r.channel_id = c.id
        LEFT JOIN epg_programs ep ON r.epg_program_id = ep.id
        WHERE r.id = ? AND r.user_id = ?
    `, [req.params.id, req.user.id]);

    if (!recording) {
        throw Errors.NotFound('Gravação');
    }

    res.json({
        success: true,
        data: { recording }
    });
}));

// Agendar gravação
router.post('/schedule', authenticate, requirePlanFeature('dvr'), checkPlanLimit('recordings'), recordingValidators.schedule, asyncHandler(async (req, res) => {
    const { channelId, title, description, startTime, endTime, epgProgramId, quality } = req.body;

    // Verificar se canal pertence ao usuário
    const [channel] = await query(`
        SELECT c.id, c.name FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE c.id = ? AND p.user_id = ?
    `, [channelId, req.user.id]);

    if (!channel) {
        throw Errors.NotFound('Canal');
    }

    // Verificar duração máxima permitida pelo plano
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationHours = (end - start) / (1000 * 60 * 60);

    if (req.user.max_recording_hours !== -1 && durationHours > req.user.max_recording_hours) {
        throw Errors.Forbidden(`Duração máxima permitida: ${req.user.max_recording_hours} horas`);
    }

    // Verificar conflitos
    const conflicts = await query(`
        SELECT id, title, start_time, end_time
        FROM recordings
        WHERE user_id = ? AND channel_id = ? AND status IN ('scheduled', 'recording')
            AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?))
    `, [req.user.id, channelId, startTime, startTime, endTime, endTime]);

    if (conflicts.length > 0) {
        throw Errors.Conflict('Já existe uma gravação agendada para este horário');
    }

    const uuid = uuidv4();

    const result = await query(`
        INSERT INTO recordings (uuid, user_id, channel_id, epg_program_id, title, description, start_time, end_time, quality, recording_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
    `, [uuid, req.user.id, channelId, epgProgramId || null, title, description || null, startTime, endTime, quality || 'auto']);

    await logActivity(req.user.id, 'recording.schedule', 'recording', result.insertId, null, { title, channelId }, req);

    res.status(201).json({
        success: true,
        message: 'Gravação agendada com sucesso',
        data: {
            id: result.insertId,
            uuid
        }
    });
}));

// Iniciar gravação imediata
router.post('/start', authenticate, requirePlanFeature('dvr'), checkPlanLimit('recordings'), asyncHandler(async (req, res) => {
    const { channelId, title, duration } = req.body;

    if (!channelId) {
        throw Errors.BadRequest('ID do canal é obrigatório');
    }

    // Verificar canal
    const [channel] = await query(`
        SELECT c.id, c.name, c.stream_url FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE c.id = ? AND p.user_id = ?
    `, [channelId, req.user.id]);

    if (!channel) {
        throw Errors.NotFound('Canal');
    }

    if (!channel.stream_url) {
        throw Errors.BadRequest('Canal não possui URL de stream');
    }

    const startTime = new Date();
    const durationMinutes = duration || 60; // Padrão: 1 hora
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    const uuid = uuidv4();
    const recordingTitle = title || `${channel.name} - ${startTime.toLocaleString('pt-BR')}`;

    const result = await query(`
        INSERT INTO recordings (uuid, user_id, channel_id, title, start_time, end_time, actual_start_time, status, recording_type)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), 'recording', 'manual')
    `, [uuid, req.user.id, channelId, recordingTitle, startTime, endTime]);

    const recordingId = result.insertId;

    // Start FFmpeg recording process (non-blocking)
    // Uses internal proxy stream to share connection with player
    recorder.startRecording(recordingId, channelId, channel.stream_url, durationMinutes)
        .then((result) => {
            if (!result.success) {
                console.error(`[Recording ${recordingId}] Failed:`, result.error);
            }
        })
        .catch((error) => {
            console.error(`[Recording ${recordingId}] Error:`, error);
        });

    await logActivity(req.user.id, 'recording.start', 'recording', recordingId, null, { channelId, duration: durationMinutes }, req);

    res.status(201).json({
        success: true,
        message: 'Gravação iniciada',
        data: {
            id: recordingId,
            uuid,
            channelName: channel.name,
            estimatedEndTime: endTime
        }
    });
}));

// Parar gravação
router.post('/:id/stop', authenticate, requirePlanFeature('dvr'), idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [recording] = await query(
        'SELECT id, status FROM recordings WHERE id = ? AND user_id = ?',
        [id, req.user.id]
    );

    if (!recording) {
        throw Errors.NotFound('Gravação');
    }

    if (recording.status !== 'recording') {
        throw Errors.BadRequest('Esta gravação não está em andamento');
    }

    // Stop FFmpeg process
    if (recorder.isRecordingActive(parseInt(id))) {
        const result = await recorder.stopRecording(parseInt(id));
        if (!result.success) {
            console.warn(`[Recording ${id}] Stop warning:`, result.error);
        }
    } else {
        // Recording not active in memory, just update database
        await query(`
            UPDATE recordings
            SET status = 'completed', actual_end_time = NOW(),
                duration = TIMESTAMPDIFF(SECOND, actual_start_time, NOW())
            WHERE id = ?
        `, [id]);
    }

    await logActivity(req.user.id, 'recording.stop', 'recording', id, null, null, req);

    res.json({
        success: true,
        message: 'Gravação finalizada'
    });
}));

// Cancelar gravação agendada
router.post('/:id/cancel', authenticate, requirePlanFeature('dvr'), idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [recording] = await query(
        'SELECT id, status FROM recordings WHERE id = ? AND user_id = ?',
        [id, req.user.id]
    );

    if (!recording) {
        throw Errors.NotFound('Gravação');
    }

    if (recording.status !== 'scheduled') {
        throw Errors.BadRequest('Apenas gravações agendadas podem ser canceladas');
    }

    await query('UPDATE recordings SET status = ? WHERE id = ?', ['cancelled', id]);

    await logActivity(req.user.id, 'recording.cancel', 'recording', id, null, null, req);

    res.json({
        success: true,
        message: 'Gravação cancelada'
    });
}));

// Deletar múltiplas gravações
router.delete('/bulk', authenticate, asyncHandler(async (req, res) => {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw Errors.BadRequest('IDs das gravações são obrigatórios');
    }

    // Limit bulk delete to 50 items at a time
    if (ids.length > 50) {
        throw Errors.BadRequest('Máximo de 50 gravações por vez');
    }

    // Get recordings that belong to user and are deletable
    const placeholders = ids.map(() => '?').join(',');
    const recordings = await query(`
        SELECT id, file_path, status
        FROM recordings
        WHERE id IN (${placeholders}) AND user_id = ? AND status != 'recording'
    `, [...ids, req.user.id]);

    if (recordings.length === 0) {
        throw Errors.NotFound('Nenhuma gravação encontrada para deletar');
    }

    // Delete files
    const deletePromises = recordings.map(async (recording) => {
        if (recording.file_path) {
            const filePath = path.join(RECORDINGS_DIR, recording.file_path);
            try {
                await fs.unlink(filePath);
                console.log(`[Recordings] Deleted file: ${filePath}`);
            } catch (err) {
                console.error(`[Recordings] Error deleting file: ${err.message}`);
            }
        }
    });

    await Promise.all(deletePromises);

    // Delete from database
    const recordingIds = recordings.map(r => r.id);
    const deletePlaceholders = recordingIds.map(() => '?').join(',');
    await query(`DELETE FROM recordings WHERE id IN (${deletePlaceholders})`, recordingIds);

    await logActivity(req.user.id, 'recording.bulk_delete', 'recording', null, null, { count: recordingIds.length }, req);

    res.json({
        success: true,
        message: `${recordingIds.length} gravação(ões) deletada(s)`,
        data: {
            deletedCount: recordingIds.length,
            deletedIds: recordingIds
        }
    });
}));

// Deletar gravação
router.delete('/:id', authenticate, idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [recording] = await query(
        'SELECT id, file_path, status FROM recordings WHERE id = ? AND user_id = ?',
        [id, req.user.id]
    );

    if (!recording) {
        throw Errors.NotFound('Gravação');
    }

    if (recording.status === 'recording') {
        throw Errors.BadRequest('Não é possível deletar uma gravação em andamento');
    }

    // Delete recording file if exists
    if (recording.file_path) {
        const filePath = path.join(RECORDINGS_DIR, recording.file_path);
        try {
            await fs.unlink(filePath);
            console.log(`[Recordings] Deleted file: ${filePath}`);
        } catch (err) {
            console.error(`[Recordings] Error deleting file: ${err.message}`);
        }
    }

    await query('DELETE FROM recordings WHERE id = ?', [id]);

    await logActivity(req.user.id, 'recording.delete', 'recording', id, null, null, req);

    res.json({
        success: true,
        message: 'Gravação deletada'
    });
}));

// Stream de gravação
router.get('/:id/stream', authenticate, idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [recording] = await query(
        'SELECT file_path, status, format FROM recordings WHERE id = ? AND user_id = ?',
        [id, req.user.id]
    );

    if (!recording) {
        throw Errors.NotFound('Gravação');
    }

    if (recording.status !== 'completed' || !recording.file_path) {
        throw Errors.BadRequest('Gravação não disponível para reprodução');
    }

    // Redirecionar para arquivo
    res.redirect(`/recordings/${recording.file_path}`);
}));

// Estatísticas de gravação
router.get('/stats/summary', authenticate, requirePlanFeature('dvr'), asyncHandler(async (req, res) => {
    const [stats] = await query(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
            SUM(CASE WHEN status = 'recording' THEN 1 ELSE 0 END) as recording,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            COALESCE(SUM(file_size), 0) as total_size,
            COALESCE(SUM(duration), 0) as total_duration
        FROM recordings
        WHERE user_id = ?
    `, [req.user.id]);

    res.json({
        success: true,
        data: { stats }
    });
}));

export default router;

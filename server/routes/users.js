import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../database/connection.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { userValidators, paginationValidator } from '../middleware/validators.js';
import { uploadAvatar, deleteFile } from '../middleware/upload.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

// Atualizar perfil do usuário
router.put('/profile', authenticate, userValidators.update, asyncHandler(async (req, res) => {
    const { firstName, lastName, preferences } = req.body;

    const updates = [];
    const values = [];

    if (firstName !== undefined) {
        updates.push('first_name = ?');
        values.push(firstName);
    }

    if (lastName !== undefined) {
        updates.push('last_name = ?');
        values.push(lastName);
    }

    if (preferences !== undefined) {
        updates.push('preferences = ?');
        values.push(JSON.stringify(preferences));
    }

    if (updates.length === 0) {
        throw Errors.BadRequest('Nenhum campo para atualizar');
    }

    values.push(req.user.id);

    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    // Buscar usuário atualizado
    const [user] = await query(`
        SELECT id, uuid, username, email, first_name, last_name, avatar_url, preferences
        FROM users WHERE id = ?
    `, [req.user.id]);

    await logActivity(req.user.id, 'user.update_profile', 'user', req.user.id, null, req.body, req);

    res.json({
        success: true,
        message: 'Perfil atualizado com sucesso',
        data: {
            user: {
                id: user.id,
                uuid: user.uuid,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                avatarUrl: user.avatar_url,
                preferences: user.preferences
            }
        }
    });
}));

// Upload de avatar
router.post('/avatar', authenticate, uploadAvatar, asyncHandler(async (req, res) => {
    if (!req.file) {
        throw Errors.BadRequest('Nenhum arquivo enviado');
    }

    // Buscar avatar antigo
    const [user] = await query('SELECT avatar_url FROM users WHERE id = ?', [req.user.id]);

    // Deletar avatar antigo se existir
    if (user.avatar_url) {
        await deleteFile(user.avatar_url).catch(console.error);
    }

    // Atualizar com novo avatar
    const avatarPath = `/uploads/avatars/${req.file.filename}`;
    await query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarPath, req.user.id]);

    res.json({
        success: true,
        message: 'Avatar atualizado com sucesso',
        data: {
            avatarUrl: avatarPath
        }
    });
}));

// Deletar avatar
router.delete('/avatar', authenticate, asyncHandler(async (req, res) => {
    const [user] = await query('SELECT avatar_url FROM users WHERE id = ?', [req.user.id]);

    if (user.avatar_url) {
        await deleteFile(user.avatar_url).catch(console.error);
        await query('UPDATE users SET avatar_url = NULL WHERE id = ?', [req.user.id]);
    }

    res.json({
        success: true,
        message: 'Avatar removido com sucesso'
    });
}));

// Obter sessões ativas
router.get('/sessions', authenticate, asyncHandler(async (req, res) => {
    const sessions = await query(`
        SELECT id, device_type, device_name, browser, os, ip_address, last_activity_at, created_at
        FROM user_sessions
        WHERE user_id = ? AND is_active = TRUE AND expires_at > NOW()
        ORDER BY last_activity_at DESC
    `, [req.user.id]);

    res.json({
        success: true,
        data: { sessions }
    });
}));

// Revogar sessão
router.delete('/sessions/:id', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;

    await query(`
        UPDATE user_sessions SET is_active = FALSE
        WHERE id = ? AND user_id = ?
    `, [id, req.user.id]);

    res.json({
        success: true,
        message: 'Sessão encerrada'
    });
}));

// Obter configurações do usuário
router.get('/settings', authenticate, asyncHandler(async (req, res) => {
    const settings = await query(`
        SELECT \`key\`, value FROM user_settings WHERE user_id = ?
    `, [req.user.id]);

    const settingsObj = settings.reduce((acc, s) => {
        acc[s.key] = s.value;
        return acc;
    }, {});

    res.json({
        success: true,
        data: { settings: settingsObj }
    });
}));

// Atualizar configuração do usuário
router.put('/settings/:key', authenticate, asyncHandler(async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;

    await query(`
        INSERT INTO user_settings (user_id, \`key\`, value)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE value = ?
    `, [req.user.id, key, value, value]);

    res.json({
        success: true,
        message: 'Configuração atualizada'
    });
}));

// Estatísticas do usuário
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
    const [playlistCount] = await query(
        'SELECT COUNT(*) as count FROM playlists WHERE user_id = ?',
        [req.user.id]
    );

    const [channelCount] = await query(`
        SELECT COUNT(*) as count FROM channels c
        JOIN playlists p ON c.playlist_id = p.id
        WHERE p.user_id = ?
    `, [req.user.id]);

    const [favoriteCount] = await query(
        'SELECT COUNT(*) as count FROM favorites WHERE user_id = ?',
        [req.user.id]
    );

    const [recordingCount] = await query(
        'SELECT COUNT(*) as count FROM recordings WHERE user_id = ?',
        [req.user.id]
    );

    const [watchTimeResult] = await query(`
        SELECT COALESCE(SUM(duration), 0) as total FROM watch_history WHERE user_id = ?
    `, [req.user.id]);

    const recentHistory = await query(`
        SELECT c.id as channel_id, c.name as channel_name, c.logo_url, c.group_title, wh.watched_at, wh.duration
        FROM watch_history wh
        JOIN channels c ON wh.channel_id = c.id
        WHERE wh.user_id = ?
        ORDER BY wh.watched_at DESC
        LIMIT 5
    `, [req.user.id]);

    res.json({
        success: true,
        data: {
            stats: {
                playlists: playlistCount.count,
                channels: channelCount.count,
                favorites: favoriteCount.count,
                recordings: recordingCount.count,
                totalWatchTime: watchTimeResult.total
            },
            recentHistory
        }
    });
}));

export default router;

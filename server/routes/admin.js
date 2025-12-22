import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { query } from '../database/connection.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { paginationValidator, userValidators, idValidator } from '../middleware/validators.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

// Middleware de admin para todas as rotas
router.use(authenticate);
router.use(requireRole('admin', 'superadmin'));

// ==================== DASHBOARD ====================

// Estatísticas gerais
router.get('/stats', asyncHandler(async (req, res) => {
    const [userStats] = await query(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as new_this_week
        FROM users
    `);

    const [playlistStats] = await query(`
        SELECT COUNT(*) as total, COALESCE(SUM(channel_count), 0) as total_channels
        FROM playlists
    `);

    const [recordingStats] = await query(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'recording' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled
        FROM recordings
    `);

    const [epgStats] = await query(`
        SELECT
            (SELECT COUNT(*) FROM epg_sources) as sources,
            (SELECT COUNT(*) FROM epg_channels) as channels,
            (SELECT COUNT(*) FROM epg_programs WHERE end_time > NOW()) as active_programs
    `);

    const recentActivity = await query(`
        SELECT al.action, al.entity_type, al.created_at, u.username
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.created_at DESC
        LIMIT 10
    `);

    res.json({
        success: true,
        data: {
            users: userStats,
            playlists: playlistStats,
            recordings: recordingStats,
            epg: epgStats,
            recentActivity
        }
    });
}));

// ==================== USUÁRIOS ====================

// Listar usuários
router.get('/users', paginationValidator, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { search, role, status, planId } = req.query;

    let sql = `
        SELECT
            u.id, u.uuid, u.username, u.email, u.first_name, u.last_name,
            u.role, u.status, u.created_at, u.last_login_at, u.login_count,
            p.name as plan_name,
            (SELECT COUNT(*) FROM playlists WHERE user_id = u.id) as playlist_count
        FROM users u
        LEFT JOIN plans p ON u.plan_id = p.id
        WHERE 1=1
    `;

    const params = [];

    if (search) {
        sql += ' AND (u.username LIKE ? OR u.email LIKE ? OR u.first_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (role) {
        sql += ' AND u.role = ?';
        params.push(role);
    }

    if (status) {
        sql += ' AND u.status = ?';
        params.push(status);
    }

    if (planId) {
        sql += ' AND u.plan_id = ?';
        params.push(planId);
    }

    const countSql = sql.replace(/SELECT[\s\S]+FROM/, 'SELECT COUNT(*) as total FROM');
    const [{ total }] = await query(countSql, params);

    sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const users = await query(sql, params);

    res.json({
        success: true,
        data: {
            users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        }
    });
}));

// Obter usuário
router.get('/users/:id', idValidator, asyncHandler(async (req, res) => {
    const [user] = await query(`
        SELECT
            u.*, p.name as plan_name,
            (SELECT COUNT(*) FROM playlists WHERE user_id = u.id) as playlist_count,
            (SELECT COUNT(*) FROM favorites WHERE user_id = u.id) as favorite_count,
            (SELECT COUNT(*) FROM recordings WHERE user_id = u.id) as recording_count
        FROM users u
        LEFT JOIN plans p ON u.plan_id = p.id
        WHERE u.id = ?
    `, [req.params.id]);

    if (!user) {
        throw Errors.NotFound('Usuário');
    }

    // Remover senha
    delete user.password_hash;

    res.json({
        success: true,
        data: { user }
    });
}));

// Criar usuário
router.post('/users', asyncHandler(async (req, res) => {
    const { username, email, password, firstName, lastName, role, planId, status } = req.body;

    const passwordHash = await bcrypt.hash(password, 12);
    const uuid = uuidv4();

    const result = await query(`
        INSERT INTO users (uuid, username, email, password_hash, first_name, last_name, role, plan_id, status, email_verified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [uuid, username, email, passwordHash, firstName || null, lastName || null, role || 'user', planId || 1, status || 'active']);

    await logActivity(req.user.id, 'admin.user.create', 'user', result.insertId, null, { username, email, role }, req);

    res.status(201).json({
        success: true,
        message: 'Usuário criado',
        data: { id: result.insertId }
    });
}));

// Atualizar usuário
router.put('/users/:id', idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { firstName, lastName, role, planId, status } = req.body;

    // Não permitir alterar superadmin se não for superadmin
    if (req.user.role !== 'superadmin') {
        const [targetUser] = await query('SELECT role FROM users WHERE id = ?', [id]);
        if (targetUser?.role === 'superadmin') {
            throw Errors.Forbidden('Não é possível alterar um superadmin');
        }
    }

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

    if (role !== undefined) {
        updates.push('role = ?');
        values.push(role);
    }

    if (planId !== undefined) {
        updates.push('plan_id = ?');
        values.push(planId);
    }

    if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
    }

    if (updates.length > 0) {
        values.push(id);
        await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    await logActivity(req.user.id, 'admin.user.update', 'user', id, null, req.body, req);

    res.json({
        success: true,
        message: 'Usuário atualizado'
    });
}));

// Resetar senha do usuário
router.post('/users/:id/reset-password', idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);

    // Revogar todos os tokens
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?', [id]);

    await logActivity(req.user.id, 'admin.user.reset_password', 'user', id, null, null, req);

    res.json({
        success: true,
        message: 'Senha resetada'
    });
}));

// Deletar usuário
router.delete('/users/:id', idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (parseInt(id) === req.user.id) {
        throw Errors.BadRequest('Não é possível deletar a própria conta');
    }

    const [user] = await query('SELECT role FROM users WHERE id = ?', [id]);

    if (user?.role === 'superadmin' && req.user.role !== 'superadmin') {
        throw Errors.Forbidden('Não é possível deletar um superadmin');
    }

    await query('DELETE FROM users WHERE id = ?', [id]);

    await logActivity(req.user.id, 'admin.user.delete', 'user', id, null, null, req);

    res.json({
        success: true,
        message: 'Usuário deletado'
    });
}));

// ==================== PLANOS ====================

// Listar planos
router.get('/plans', asyncHandler(async (req, res) => {
    const plans = await query(`
        SELECT p.*, (SELECT COUNT(*) FROM users WHERE plan_id = p.id) as user_count
        FROM plans p
        ORDER BY p.price
    `);

    res.json({
        success: true,
        data: { plans }
    });
}));

// Criar plano
router.post('/plans', asyncHandler(async (req, res) => {
    const {
        name, slug, description, maxPlaylists, maxChannels, maxFavorites,
        maxRecordings, maxRecordingHours, canUseEpg, canUseDvr, price
    } = req.body;

    const result = await query(`
        INSERT INTO plans (name, slug, description, max_playlists, max_channels, max_favorites, max_recordings, max_recording_hours, can_use_epg, can_use_dvr, price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, slug, description, maxPlaylists, maxChannels, maxFavorites, maxRecordings, maxRecordingHours, canUseEpg, canUseDvr, price]);

    res.status(201).json({
        success: true,
        message: 'Plano criado',
        data: { id: result.insertId }
    });
}));

// Atualizar plano
router.put('/plans/:id', idValidator, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const fields = [
        'name', 'description', 'max_playlists', 'max_channels', 'max_favorites',
        'max_recordings', 'max_recording_hours', 'can_use_epg', 'can_use_dvr', 'price', 'is_active'
    ];

    const updates = [];
    const values = [];

    for (const field of fields) {
        const camelField = field.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
        if (req.body[camelField] !== undefined) {
            updates.push(`${field} = ?`);
            values.push(req.body[camelField]);
        }
    }

    if (updates.length > 0) {
        values.push(id);
        await query(`UPDATE plans SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    res.json({
        success: true,
        message: 'Plano atualizado'
    });
}));

// ==================== LOGS ====================

// Logs de atividade
router.get('/logs/activity', paginationValidator, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const { userId, action, entityType, dateFrom, dateTo } = req.query;

    let sql = `
        SELECT al.*, u.username
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
    `;

    const params = [];

    if (userId) {
        sql += ' AND al.user_id = ?';
        params.push(userId);
    }

    if (action) {
        sql += ' AND al.action LIKE ?';
        params.push(`%${action}%`);
    }

    if (entityType) {
        sql += ' AND al.entity_type = ?';
        params.push(entityType);
    }

    if (dateFrom) {
        sql += ' AND al.created_at >= ?';
        params.push(dateFrom);
    }

    if (dateTo) {
        sql += ' AND al.created_at <= ?';
        params.push(dateTo);
    }

    const countSql = sql.replace(/SELECT[\s\S]+FROM/, 'SELECT COUNT(*) as total FROM');
    const [{ total }] = await query(countSql, params);

    sql += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const logs = await query(sql, params);

    res.json({
        success: true,
        data: {
            logs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        }
    });
}));

// Logs do sistema
router.get('/logs/system', paginationValidator, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const { level, component } = req.query;

    let sql = 'SELECT * FROM system_logs WHERE 1=1';
    const params = [];

    if (level) {
        sql += ' AND level = ?';
        params.push(level);
    }

    if (component) {
        sql += ' AND component = ?';
        params.push(component);
    }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [{ total }] = await query(countSql, params);

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const logs = await query(sql, params);

    res.json({
        success: true,
        data: {
            logs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        }
    });
}));

// ==================== EPG Global ====================

// Fontes de EPG globais
router.get('/epg/sources', asyncHandler(async (req, res) => {
    const sources = await query(`
        SELECT es.*, u.username as owner
        FROM epg_sources es
        LEFT JOIN users u ON es.user_id = u.id
        ORDER BY es.name
    `);

    res.json({
        success: true,
        data: { sources }
    });
}));

// Forçar sync de EPG
router.post('/epg/sources/:id/sync', idValidator, asyncHandler(async (req, res) => {
    // Chamar job de sync (implementar)
    res.json({
        success: true,
        message: 'Sincronização iniciada'
    });
}));

export default router;

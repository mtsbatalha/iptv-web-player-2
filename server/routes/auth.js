import express from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../database/connection.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { authenticate, generateTokens } from '../middleware/auth.js';
import { authValidators } from '../middleware/validators.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

// Registrar novo usuário
router.post('/register', authValidators.register, asyncHandler(async (req, res) => {
    const { username, email, password, firstName, lastName } = req.body;

    // Verificar se email já existe
    const [existingEmail] = await query(
        'SELECT id FROM users WHERE email = ?',
        [email]
    );

    if (existingEmail) {
        throw Errors.Conflict('Este email já está em uso');
    }

    // Verificar se username já existe
    const [existingUsername] = await query(
        'SELECT id FROM users WHERE username = ?',
        [username]
    );

    if (existingUsername) {
        throw Errors.Conflict('Este username já está em uso');
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 12);

    // Criar usuário
    const uuid = uuidv4();
    const result = await query(`
        INSERT INTO users (uuid, username, email, password_hash, first_name, last_name, status, plan_id)
        VALUES (?, ?, ?, ?, ?, ?, 'active', 1)
    `, [uuid, username, email, passwordHash, firstName || null, lastName || null]);

    const userId = result.insertId;

    // Buscar usuário criado
    const [user] = await query(`
        SELECT
            u.id, u.uuid, u.username, u.email, u.first_name, u.last_name,
            u.role, u.status, u.plan_id, p.name as plan_name
        FROM users u
        LEFT JOIN plans p ON u.plan_id = p.id
        WHERE u.id = ?
    `, [userId]);

    // Gerar tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Salvar refresh token
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias
    await query(`
        INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, device_info)
        VALUES (?, ?, ?, ?, ?)
    `, [userId, refreshToken, expiresAt, req.ip, req.headers['user-agent']]);

    // Log de atividade
    await logActivity(userId, 'user.register', 'user', userId, null, { email, username }, req);

    res.status(201).json({
        success: true,
        message: 'Usuário registrado com sucesso',
        data: {
            user: {
                id: user.id,
                uuid: user.uuid,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                plan: user.plan_name
            },
            tokens: {
                accessToken,
                refreshToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '7d'
            }
        }
    });
}));

// Login
router.post('/login', authValidators.login, asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Buscar usuário
    const [user] = await query(`
        SELECT
            u.id, u.uuid, u.username, u.email, u.password_hash, u.first_name, u.last_name,
            u.avatar_url, u.role, u.status, u.plan_id, u.preferences,
            p.name as plan_name, p.max_playlists, p.max_channels, p.max_favorites,
            p.max_recordings, p.can_use_epg, p.can_use_dvr
        FROM users u
        LEFT JOIN plans p ON u.plan_id = p.id
        WHERE u.email = ?
    `, [email]);

    if (!user) {
        throw Errors.Unauthorized('Email ou senha incorretos');
    }

    // Verificar status
    if (user.status !== 'active') {
        const statusMessages = {
            inactive: 'Conta inativa. Entre em contato com o suporte.',
            suspended: 'Conta suspensa. Entre em contato com o suporte.',
            pending: 'Conta pendente de verificação.'
        };

        throw Errors.Forbidden(statusMessages[user.status] || 'Conta indisponível');
    }

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
        throw Errors.Unauthorized('Email ou senha incorretos');
    }

    // Gerar tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Salvar refresh token
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await query(`
        INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, device_info)
        VALUES (?, ?, ?, ?, ?)
    `, [user.id, refreshToken, expiresAt, req.ip, req.headers['user-agent']]);

    // Atualizar último login
    await query(`
        UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = ?
    `, [user.id]);

    // Log de atividade
    await logActivity(user.id, 'user.login', 'user', user.id, null, null, req);

    res.json({
        success: true,
        message: 'Login realizado com sucesso',
        data: {
            user: {
                id: user.id,
                uuid: user.uuid,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                avatarUrl: user.avatar_url,
                role: user.role,
                preferences: user.preferences,
                plan: {
                    name: user.plan_name,
                    maxPlaylists: user.max_playlists,
                    maxChannels: user.max_channels,
                    maxFavorites: user.max_favorites,
                    maxRecordings: user.max_recordings,
                    canUseEpg: !!user.can_use_epg,
                    canUseDvr: !!user.can_use_dvr
                }
            },
            tokens: {
                accessToken,
                refreshToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '7d'
            }
        }
    });
}));

// Refresh token
router.post('/refresh', asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        throw Errors.BadRequest('Refresh token é obrigatório');
    }

    // Buscar token
    const [tokenRecord] = await query(`
        SELECT rt.*, u.status as user_status
        FROM refresh_tokens rt
        JOIN users u ON rt.user_id = u.id
        WHERE rt.token = ? AND rt.expires_at > NOW() AND rt.revoked_at IS NULL
    `, [refreshToken]);

    if (!tokenRecord) {
        throw Errors.Unauthorized('Refresh token inválido ou expirado');
    }

    if (tokenRecord.user_status !== 'active') {
        throw Errors.Forbidden('Usuário inativo');
    }

    // Buscar usuário
    const [user] = await query(`
        SELECT id, uuid, username, email, role, plan_id
        FROM users WHERE id = ?
    `, [tokenRecord.user_id]);

    // Gerar novos tokens
    const tokens = generateTokens(user);

    // Revogar token antigo
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [tokenRecord.id]);

    // Salvar novo refresh token
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await query(`
        INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, device_info)
        VALUES (?, ?, ?, ?, ?)
    `, [user.id, tokens.refreshToken, expiresAt, req.ip, req.headers['user-agent']]);

    res.json({
        success: true,
        data: {
            tokens: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '7d'
            }
        }
    });
}));

// Logout
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
        // Revogar refresh token específico
        await query(`
            UPDATE refresh_tokens SET revoked_at = NOW()
            WHERE token = ? AND user_id = ?
        `, [refreshToken, req.user.id]);
    }

    // Log de atividade
    await logActivity(req.user.id, 'user.logout', 'user', req.user.id, null, null, req);

    res.json({
        success: true,
        message: 'Logout realizado com sucesso'
    });
}));

// Logout de todos os dispositivos
router.post('/logout-all', authenticate, asyncHandler(async (req, res) => {
    // Revogar todos os refresh tokens do usuário
    await query(`
        UPDATE refresh_tokens SET revoked_at = NOW()
        WHERE user_id = ? AND revoked_at IS NULL
    `, [req.user.id]);

    // Log de atividade
    await logActivity(req.user.id, 'user.logout_all', 'user', req.user.id, null, null, req);

    res.json({
        success: true,
        message: 'Logout realizado em todos os dispositivos'
    });
}));

// Obter usuário atual
router.get('/me', authenticate, asyncHandler(async (req, res) => {
    const [user] = await query(`
        SELECT
            u.id, u.uuid, u.username, u.email, u.first_name, u.last_name,
            u.avatar_url, u.role, u.status, u.preferences, u.created_at,
            p.name as plan_name, p.max_playlists, p.max_channels, p.max_favorites,
            p.max_recordings, p.max_recording_hours, p.can_use_epg, p.can_use_dvr
        FROM users u
        LEFT JOIN plans p ON u.plan_id = p.id
        WHERE u.id = ?
    `, [req.user.id]);

    // Contar recursos usados
    const [playlistCount] = await query(
        'SELECT COUNT(*) as count FROM playlists WHERE user_id = ?',
        [req.user.id]
    );

    const [favoriteCount] = await query(
        'SELECT COUNT(*) as count FROM favorites WHERE user_id = ?',
        [req.user.id]
    );

    res.json({
        success: true,
        data: {
            user: {
                id: user.id,
                uuid: user.uuid,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                avatarUrl: user.avatar_url,
                role: user.role,
                preferences: user.preferences,
                createdAt: user.created_at,
                plan: {
                    name: user.plan_name,
                    limits: {
                        maxPlaylists: user.max_playlists,
                        maxChannels: user.max_channels,
                        maxFavorites: user.max_favorites,
                        maxRecordings: user.max_recordings,
                        maxRecordingHours: user.max_recording_hours
                    },
                    features: {
                        canUseEpg: !!user.can_use_epg,
                        canUseDvr: !!user.can_use_dvr
                    }
                },
                usage: {
                    playlists: playlistCount.count,
                    favorites: favoriteCount.count
                }
            }
        }
    });
}));

// Alterar senha
router.post('/change-password', authenticate, authValidators.changePassword, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    // Buscar senha atual
    const [user] = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);

    // Verificar senha atual
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isValid) {
        throw Errors.Unauthorized('Senha atual incorreta');
    }

    // Hash da nova senha
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Atualizar senha
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [newPasswordHash, req.user.id]);

    // Revogar todos os refresh tokens (forçar relogin em outros dispositivos)
    await query(`
        UPDATE refresh_tokens SET revoked_at = NOW()
        WHERE user_id = ? AND revoked_at IS NULL
    `, [req.user.id]);

    // Log de atividade
    await logActivity(req.user.id, 'user.change_password', 'user', req.user.id, null, null, req);

    res.json({
        success: true,
        message: 'Senha alterada com sucesso. Faça login novamente.'
    });
}));

export default router;

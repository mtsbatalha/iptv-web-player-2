import jwt from 'jsonwebtoken';
import { query } from '../database/connection.js';
import { AppError, Errors } from './errorHandler.js';

// Middleware de autenticação
export async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw Errors.Unauthorized('Token não fornecido');
        }

        const token = authHeader.split(' ')[1];

        // Verificar token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Buscar usuário
        const [user] = await query(`
            SELECT
                u.id, u.uuid, u.username, u.email, u.first_name, u.last_name,
                u.avatar_url, u.role, u.status, u.plan_id,
                p.name as plan_name, p.max_playlists, p.max_channels,
                p.max_favorites, p.max_recordings, p.max_recording_hours,
                p.can_use_epg, p.can_use_dvr
            FROM users u
            LEFT JOIN plans p ON u.plan_id = p.id
            WHERE u.id = ? AND u.status = 'active'
        `, [decoded.userId]);

        if (!user) {
            throw Errors.Unauthorized('Usuário não encontrado ou inativo');
        }

        // Adicionar usuário à requisição
        req.user = user;
        req.token = token;

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return next(Errors.Unauthorized('Token inválido ou expirado'));
        }
        next(error);
    }
}

// Middleware opcional de autenticação (não falha se não autenticado)
export async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [user] = await query(`
            SELECT
                u.id, u.uuid, u.username, u.email, u.role, u.status, u.plan_id
            FROM users u
            WHERE u.id = ? AND u.status = 'active'
        `, [decoded.userId]);

        if (user) {
            req.user = user;
            req.token = token;
        }

        next();
    } catch (error) {
        // Ignora erros de token e continua sem autenticação
        next();
    }
}

// Middleware de verificação de roles
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return next(Errors.Unauthorized('Autenticação necessária'));
        }

        if (!roles.includes(req.user.role)) {
            return next(Errors.Forbidden('Você não tem permissão para acessar este recurso'));
        }

        next();
    };
}

// Middleware de verificação de permissões do plano
export function requirePlanFeature(feature) {
    return (req, res, next) => {
        if (!req.user) {
            return next(Errors.Unauthorized('Autenticação necessária'));
        }

        const featureMap = {
            epg: 'can_use_epg',
            dvr: 'can_use_dvr'
        };

        const planFeature = featureMap[feature];

        if (planFeature && !req.user[planFeature]) {
            return next(Errors.Forbidden(`Seu plano não permite usar ${feature}. Faça upgrade para continuar.`));
        }

        next();
    };
}

// Middleware para verificar limite do plano
export function checkPlanLimit(limitType) {
    return async (req, res, next) => {
        if (!req.user) {
            return next(Errors.Unauthorized('Autenticação necessária'));
        }

        const limitMap = {
            playlists: { field: 'max_playlists', table: 'playlists', userField: 'user_id' },
            channels: { field: 'max_channels', table: 'channels', join: 'playlists', userField: 'user_id' },
            favorites: { field: 'max_favorites', table: 'favorites', userField: 'user_id' },
            recordings: { field: 'max_recordings', table: 'recordings', userField: 'user_id' }
        };

        const limit = limitMap[limitType];

        if (!limit) {
            return next();
        }

        const maxLimit = req.user[limit.field];

        // -1 significa ilimitado
        if (maxLimit === -1) {
            return next();
        }

        let countQuery;
        if (limit.join) {
            countQuery = `
                SELECT COUNT(*) as count
                FROM ${limit.table} c
                JOIN ${limit.join} p ON c.playlist_id = p.id
                WHERE p.${limit.userField} = ?
            `;
        } else {
            countQuery = `SELECT COUNT(*) as count FROM ${limit.table} WHERE ${limit.userField} = ?`;
        }

        const [result] = await query(countQuery, [req.user.id]);
        const currentCount = result.count;

        if (currentCount >= maxLimit) {
            return next(Errors.Forbidden(
                `Limite de ${limitType} atingido (${maxLimit}). Faça upgrade do seu plano para adicionar mais.`
            ));
        }

        next();
    };
}

// Gerar tokens
export function generateTokens(user) {
    const accessToken = jwt.sign(
        {
            userId: user.id,
            role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const refreshToken = jwt.sign(
        {
            userId: user.id,
            type: 'refresh'
        },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
    );

    return { accessToken, refreshToken };
}

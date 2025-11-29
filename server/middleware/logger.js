import { query } from '../database/connection.js';

// Middleware de logging de requisições
export function requestLogger(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;

        // Log apenas em desenvolvimento
        if (process.env.NODE_ENV === 'development') {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
        }
    });

    next();
}

// Função para registrar atividade do usuário
export async function logActivity(userId, action, entityType = null, entityId = null, oldValues = null, newValues = null, req = null) {
    try {
        await query(`
            INSERT INTO activity_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            userId,
            action,
            entityType,
            entityId,
            oldValues ? JSON.stringify(oldValues) : null,
            newValues ? JSON.stringify(newValues) : null,
            req?.ip || null,
            req?.headers['user-agent'] || null
        ]);
    } catch (error) {
        console.error('Erro ao registrar atividade:', error);
    }
}

// Função para registrar log do sistema
export async function logSystem(level, component, message, context = null) {
    try {
        await query(`
            INSERT INTO system_logs (level, component, message, context)
            VALUES (?, ?, ?, ?)
        `, [
            level,
            component,
            message,
            context ? JSON.stringify(context) : null
        ]);
    } catch (error) {
        console.error('Erro ao registrar log do sistema:', error);
    }
}

// Middleware para registrar atividade automaticamente
export function activityLogger(action, entityType) {
    return async (req, res, next) => {
        const originalSend = res.send;

        res.send = function (body) {
            // Registrar atividade apenas em sucesso
            if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
                const entityId = req.params.id || req.body?.id || null;

                logActivity(
                    req.user.id,
                    action,
                    entityType,
                    entityId,
                    null,
                    req.body,
                    req
                ).catch(console.error);
            }

            return originalSend.call(this, body);
        };

        next();
    };
}

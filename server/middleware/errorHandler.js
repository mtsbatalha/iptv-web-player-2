import { query } from '../database/connection.js';

// Classe de erro personalizada
export class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

// Erros comuns
export const Errors = {
    NotFound: (resource = 'Recurso') => new AppError(`${resource} não encontrado`, 404, 'NOT_FOUND'),
    Unauthorized: (message = 'Não autorizado') => new AppError(message, 401, 'UNAUTHORIZED'),
    Forbidden: (message = 'Acesso negado') => new AppError(message, 403, 'FORBIDDEN'),
    BadRequest: (message = 'Requisição inválida') => new AppError(message, 400, 'BAD_REQUEST'),
    Conflict: (message = 'Conflito de dados') => new AppError(message, 409, 'CONFLICT'),
    TooManyRequests: (message = 'Muitas requisições') => new AppError(message, 429, 'TOO_MANY_REQUESTS'),
    ValidationError: (message = 'Erro de validação') => new AppError(message, 422, 'VALIDATION_ERROR'),
    Internal: (message = 'Erro interno do servidor') => new AppError(message, 500, 'INTERNAL_ERROR')
};

// Handler para rotas não encontradas
export function notFoundHandler(req, res, next) {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `Rota não encontrada: ${req.method} ${req.originalUrl}`
        }
    });
}

// Handler principal de erros
export function errorHandler(err, req, res, next) {
    // Log do erro
    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        code: err.code,
        statusCode: err.statusCode
    });

    // Salvar log no banco (async, não bloqueia resposta)
    logError(err, req).catch(console.error);

    // Erros operacionais conhecidos
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            success: false,
            error: {
                code: err.code,
                message: err.message
            }
        });
    }

    // Erros de validação do express-validator
    if (err.array && typeof err.array === 'function') {
        return res.status(422).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Erro de validação',
                details: err.array()
            }
        });
    }

    // Erros do MySQL
    if (err.code && err.code.startsWith('ER_')) {
        const mysqlErrors = {
            ER_DUP_ENTRY: { status: 409, message: 'Registro duplicado' },
            ER_NO_REFERENCED_ROW: { status: 400, message: 'Referência inválida' },
            ER_ROW_IS_REFERENCED: { status: 400, message: 'Registro em uso' },
            ER_DATA_TOO_LONG: { status: 400, message: 'Dados muito longos' },
            ER_TRUNCATED_WRONG_VALUE: { status: 400, message: 'Valor inválido' }
        };

        const mysqlError = mysqlErrors[err.code] || { status: 500, message: 'Erro de banco de dados' };

        return res.status(mysqlError.status).json({
            success: false,
            error: {
                code: err.code,
                message: mysqlError.message
            }
        });
    }

    // Erro JWT
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            error: {
                code: 'INVALID_TOKEN',
                message: 'Token inválido'
            }
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            error: {
                code: 'TOKEN_EXPIRED',
                message: 'Token expirado'
            }
        });
    }

    // Erro genérico (não expor detalhes em produção)
    const isDev = process.env.NODE_ENV === 'development';

    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: isDev ? err.message : 'Erro interno do servidor',
            ...(isDev && { stack: err.stack })
        }
    });
}

// Função para logar erro no banco
async function logError(err, req) {
    try {
        await query(`
            INSERT INTO system_logs (level, component, message, context)
            VALUES (?, ?, ?, ?)
        `, [
            'error',
            'api',
            err.message,
            JSON.stringify({
                code: err.code,
                statusCode: err.statusCode,
                path: req.path,
                method: req.method,
                ip: req.ip,
                userId: req.user?.id,
                stack: err.stack
            })
        ]);
    } catch (logError) {
        console.error('Erro ao salvar log:', logError);
    }
}

// Wrapper para async handlers
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

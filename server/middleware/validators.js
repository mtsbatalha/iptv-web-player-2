import { body, param, query, validationResult } from 'express-validator';
import { AppError } from './errorHandler.js';

// Middleware para processar erros de validação
export const validate = (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const messages = errors.array().map(err => ({
            field: err.path,
            message: err.msg
        }));

        return res.status(422).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Erro de validação',
                details: messages
            }
        });
    }

    next();
};

// Validadores de autenticação
export const authValidators = {
    register: [
        body('username')
            .trim()
            .isLength({ min: 3, max: 50 })
            .withMessage('Username deve ter entre 3 e 50 caracteres')
            .matches(/^[a-zA-Z0-9_]+$/)
            .withMessage('Username pode conter apenas letras, números e underscore'),
        body('email')
            .trim()
            .isEmail()
            .withMessage('Email inválido')
            .normalizeEmail(),
        body('password')
            .isLength({ min: 6 })
            .withMessage('Senha deve ter no mínimo 6 caracteres')
            .matches(/\d/)
            .withMessage('Senha deve conter ao menos um número'),
        body('firstName')
            .optional()
            .trim()
            .isLength({ max: 100 })
            .withMessage('Nome deve ter no máximo 100 caracteres'),
        body('lastName')
            .optional()
            .trim()
            .isLength({ max: 100 })
            .withMessage('Sobrenome deve ter no máximo 100 caracteres'),
        validate
    ],

    login: [
        body('email')
            .trim()
            .isEmail()
            .withMessage('Email inválido')
            .normalizeEmail(),
        body('password')
            .notEmpty()
            .withMessage('Senha é obrigatória'),
        validate
    ],

    changePassword: [
        body('currentPassword')
            .notEmpty()
            .withMessage('Senha atual é obrigatória'),
        body('newPassword')
            .isLength({ min: 6 })
            .withMessage('Nova senha deve ter no mínimo 6 caracteres')
            .matches(/\d/)
            .withMessage('Nova senha deve conter ao menos um número'),
        validate
    ]
};

// Validadores de playlist
export const playlistValidators = {
    create: [
        body('name')
            .trim()
            .isLength({ min: 1, max: 255 })
            .withMessage('Nome da playlist é obrigatório (máx. 255 caracteres)'),
        body('sourceUrl')
            .isURL()
            .withMessage('URL inválida'),
        body('autoUpdate')
            .optional()
            .isBoolean()
            .withMessage('autoUpdate deve ser boolean'),
        body('updateInterval')
            .optional()
            .isInt({ min: 1, max: 168 })
            .withMessage('Intervalo de atualização deve ser entre 1 e 168 horas'),
        validate
    ],

    update: [
        param('id')
            .isInt()
            .withMessage('ID inválido'),
        body('name')
            .optional()
            .trim()
            .isLength({ min: 1, max: 255 })
            .withMessage('Nome deve ter entre 1 e 255 caracteres'),
        body('autoUpdate')
            .optional()
            .isBoolean()
            .withMessage('autoUpdate deve ser boolean'),
        validate
    ]
};

// Validadores de EPG
export const epgValidators = {
    addSource: [
        body('name')
            .trim()
            .isLength({ min: 1, max: 255 })
            .withMessage('Nome da fonte é obrigatório'),
        body('url')
            .isURL()
            .withMessage('URL inválida'),
        body('autoUpdate')
            .optional()
            .isBoolean(),
        body('updateInterval')
            .optional()
            .isInt({ min: 1, max: 24 })
            .withMessage('Intervalo deve ser entre 1 e 24 horas'),
        validate
    ]
};

// Validadores de gravação
export const recordingValidators = {
    schedule: [
        body('channelId')
            .isInt()
            .withMessage('ID do canal é obrigatório'),
        body('title')
            .trim()
            .isLength({ min: 1, max: 500 })
            .withMessage('Título é obrigatório'),
        body('startTime')
            .isISO8601()
            .withMessage('Data/hora de início inválida'),
        body('endTime')
            .isISO8601()
            .withMessage('Data/hora de fim inválida')
            .custom((value, { req }) => {
                if (new Date(value) <= new Date(req.body.startTime)) {
                    throw new Error('Hora de fim deve ser depois da hora de início');
                }
                return true;
            }),
        validate
    ]
};

// Validadores de usuário
export const userValidators = {
    update: [
        body('firstName')
            .optional()
            .trim()
            .isLength({ max: 100 }),
        body('lastName')
            .optional()
            .trim()
            .isLength({ max: 100 }),
        body('email')
            .optional()
            .isEmail()
            .normalizeEmail(),
        validate
    ],

    updateRole: [
        param('id')
            .isInt()
            .withMessage('ID inválido'),
        body('role')
            .isIn(['user', 'moderator', 'admin', 'superadmin'])
            .withMessage('Role inválida'),
        validate
    ]
};

// Validador de paginação
export const paginationValidator = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Página deve ser um número positivo'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limite deve ser entre 1 e 100'),
    validate
];

// Validador de ID
export const idValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID inválido'),
    validate
];

// Validador de UUID
export const uuidValidator = [
    param('uuid')
        .isUUID()
        .withMessage('UUID inválido'),
    validate
];

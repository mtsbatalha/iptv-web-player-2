import express from 'express';
import { query } from '../database/connection.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Obter configurações públicas (sem autenticação)
router.get('/public', asyncHandler(async (req, res) => {
    const settings = await query(`
        SELECT \`key\`, value, type FROM settings WHERE is_public = TRUE
    `);

    const settingsObj = settings.reduce((acc, s) => {
        acc[s.key] = parseSettingValue(s.value, s.type);
        return acc;
    }, {});

    res.json({
        success: true,
        data: { settings: settingsObj }
    });
}));

// Obter todas as configurações (admin)
router.get('/', authenticate, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    const settings = await query('SELECT * FROM settings ORDER BY `key`');

    const settingsObj = settings.reduce((acc, s) => {
        acc[s.key] = {
            value: parseSettingValue(s.value, s.type),
            type: s.type,
            description: s.description,
            isPublic: !!s.is_public
        };
        return acc;
    }, {});

    res.json({
        success: true,
        data: { settings: settingsObj }
    });
}));

// Atualizar configuração
router.put('/:key', authenticate, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    const { key } = req.params;
    const { value, isPublic } = req.body;

    const [setting] = await query('SELECT id, type FROM settings WHERE `key` = ?', [key]);

    if (!setting) {
        throw Errors.NotFound('Configuração');
    }

    const updates = ['value = ?'];
    const values = [String(value)];

    if (isPublic !== undefined) {
        updates.push('is_public = ?');
        values.push(isPublic);
    }

    values.push(key);

    await query(`UPDATE settings SET ${updates.join(', ')} WHERE \`key\` = ?`, values);

    res.json({
        success: true,
        message: 'Configuração atualizada'
    });
}));

// Criar nova configuração
router.post('/', authenticate, requireRole('superadmin'), asyncHandler(async (req, res) => {
    const { key, value, type, description, isPublic } = req.body;

    if (!key) {
        throw Errors.BadRequest('Key é obrigatória');
    }

    await query(`
        INSERT INTO settings (\`key\`, value, type, description, is_public)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE value = ?, description = ?
    `, [key, String(value), type || 'string', description || null, isPublic || false, String(value), description]);

    res.status(201).json({
        success: true,
        message: 'Configuração criada'
    });
}));

// Deletar configuração
router.delete('/:key', authenticate, requireRole('superadmin'), asyncHandler(async (req, res) => {
    const { key } = req.params;

    await query('DELETE FROM settings WHERE `key` = ?', [key]);

    res.json({
        success: true,
        message: 'Configuração removida'
    });
}));

// Helper para parsear valor de configuração
function parseSettingValue(value, type) {
    switch (type) {
        case 'number':
            return Number(value);
        case 'boolean':
            return value === 'true' || value === '1';
        case 'json':
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        default:
            return value;
    }
}

export default router;

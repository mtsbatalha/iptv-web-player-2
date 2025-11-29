import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { AppError } from './errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório base para uploads
const uploadDir = path.join(__dirname, '../../uploads');

// Criar diretórios se não existirem
const directories = ['playlists', 'avatars', 'logos', 'temp'];
directories.forEach(dir => {
    const dirPath = path.join(uploadDir, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
});

// Configuração de armazenamento
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let subDir = 'temp';

        if (file.fieldname === 'playlist') {
            subDir = 'playlists';
        } else if (file.fieldname === 'avatar') {
            subDir = 'avatars';
        } else if (file.fieldname === 'logo') {
            subDir = 'logos';
        }

        cb(null, path.join(uploadDir, subDir));
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// Filtro de tipos de arquivo
const fileFilter = (req, file, cb) => {
    const allowedTypes = {
        playlist: ['.m3u', '.m3u8', '.txt'],
        avatar: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
        logo: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
    };

    const ext = path.extname(file.originalname).toLowerCase();
    const fieldAllowed = allowedTypes[file.fieldname] || [];

    if (fieldAllowed.includes(ext)) {
        cb(null, true);
    } else {
        cb(new AppError(
            `Tipo de arquivo não permitido. Formatos aceitos: ${fieldAllowed.join(', ')}`,
            400,
            'INVALID_FILE_TYPE'
        ), false);
    }
};

// Configuração do multer
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB padrão
        files: 1
    }
});

// Middleware para upload de playlist
export const uploadPlaylist = upload.single('playlist');

// Middleware para upload de avatar
export const uploadAvatar = upload.single('avatar');

// Middleware para upload de logo
export const uploadLogo = upload.single('logo');

// Função para deletar arquivo
export function deleteFile(filePath) {
    return new Promise((resolve, reject) => {
        if (!filePath) {
            resolve();
            return;
        }

        const fullPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(__dirname, '../../', filePath);

        fs.unlink(fullPath, (err) => {
            if (err && err.code !== 'ENOENT') {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

// Função para mover arquivo
export function moveFile(source, destination) {
    return new Promise((resolve, reject) => {
        const destDir = path.dirname(destination);

        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        fs.rename(source, destination, (err) => {
            if (err) {
                // Se rename falhar (diferentes partições), copiar e deletar
                fs.copyFile(source, destination, (copyErr) => {
                    if (copyErr) {
                        reject(copyErr);
                    } else {
                        fs.unlink(source, (unlinkErr) => {
                            if (unlinkErr) {
                                console.error('Erro ao deletar arquivo original:', unlinkErr);
                            }
                            resolve(destination);
                        });
                    }
                });
            } else {
                resolve(destination);
            }
        });
    });
}

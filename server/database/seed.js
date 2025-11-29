import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import pool from './connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function seed() {
    console.log('🌱 Iniciando seed do banco de dados...\n');

    const connection = await pool.getConnection();

    try {
        // Criar usuário admin
        console.log('👤 Criando usuário administrador...');

        const adminPassword = await bcrypt.hash('admin123', 12);
        const adminUuid = uuidv4();

        await connection.execute(`
            INSERT INTO users (uuid, username, email, password_hash, first_name, last_name, role, plan_id, status, email_verified_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE updated_at = NOW()
        `, [adminUuid, 'admin', 'admin@iptv.local', adminPassword, 'Admin', 'System', 'superadmin', 4, 'active']);

        console.log('   ✅ Admin criado: admin@iptv.local / admin123');

        // Criar usuário de teste
        console.log('👤 Criando usuário de teste...');

        const userPassword = await bcrypt.hash('user123', 12);
        const userUuid = uuidv4();

        await connection.execute(`
            INSERT INTO users (uuid, username, email, password_hash, first_name, last_name, role, plan_id, status, email_verified_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE updated_at = NOW()
        `, [userUuid, 'usuario', 'user@iptv.local', userPassword, 'Usuário', 'Teste', 'user', 2, 'active']);

        console.log('   ✅ Usuário criado: user@iptv.local / user123');

        // Criar categorias padrão
        console.log('📁 Criando categorias padrão...');

        const categories = [
            { name: 'Notícias', slug: 'noticias', icon: '📰', color: '#EF4444' },
            { name: 'Esportes', slug: 'esportes', icon: '⚽', color: '#22C55E' },
            { name: 'Filmes', slug: 'filmes', icon: '🎬', color: '#8B5CF6' },
            { name: 'Séries', slug: 'series', icon: '📺', color: '#3B82F6' },
            { name: 'Infantil', slug: 'infantil', icon: '🧸', color: '#F59E0B' },
            { name: 'Documentários', slug: 'documentarios', icon: '🎥', color: '#06B6D4' },
            { name: 'Música', slug: 'musica', icon: '🎵', color: '#EC4899' },
            { name: 'Variedades', slug: 'variedades', icon: '🎭', color: '#14B8A6' }
        ];

        for (const cat of categories) {
            await connection.execute(`
                INSERT INTO categories (name, slug, icon, color, is_custom)
                VALUES (?, ?, ?, ?, FALSE)
                ON DUPLICATE KEY UPDATE updated_at = NOW()
            `, [cat.name, cat.slug, cat.icon, cat.color]);
        }

        console.log('   ✅ Categorias padrão criadas');

        // Criar fonte de EPG de exemplo
        console.log('📅 Criando fonte de EPG de exemplo...');

        await connection.execute(`
            INSERT INTO epg_sources (name, url, is_active, auto_update, update_interval)
            VALUES (?, ?, TRUE, TRUE, 6)
            ON DUPLICATE KEY UPDATE updated_at = NOW()
        `, ['EPG Brasil', 'https://epg.example.com/brazil.xml']);

        console.log('   ✅ Fonte de EPG criada');

        console.log('\n✅ Seed concluído com sucesso!');

    } catch (error) {
        console.error('\n❌ Erro no seed:', error.message);
        process.exit(1);
    } finally {
        connection.release();
        process.exit(0);
    }
}

seed();

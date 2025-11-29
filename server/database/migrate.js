import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env do diretório raiz do projeto
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function migrate() {
    console.log('🚀 Iniciando migração do banco de dados...\n');
    console.log(`📌 Host: ${process.env.DB_HOST}`);
    console.log(`📌 Banco: ${process.env.DB_NAME}`);
    console.log(`📌 Usuário: ${process.env.DB_USER}\n`);

    // Conexão direta ao banco existente (hospedagem compartilhada)
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME, // Conectar ao banco existente
        multipleStatements: true
    });

    try {
        // Ler arquivo SQL
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Executar schema
        console.log('📦 Executando schema SQL...');
        await connection.query(schema);

        console.log('\n✅ Migração concluída com sucesso!');
        console.log('📊 Banco de dados atualizado: ' + process.env.DB_NAME);

    } catch (error) {
        console.error('\n❌ Erro na migração:', error.message);
        if (error.code) {
            console.error('   Código:', error.code);
        }
        if (error.sqlMessage) {
            console.error('   SQL:', error.sqlMessage);
        }
        process.exit(1);
    } finally {
        await connection.end();
    }
}

migrate();

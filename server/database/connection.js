import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'iptv_player',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Testar conexão
export async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Conexão com MySQL estabelecida com sucesso');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Erro ao conectar com MySQL:', error.message);
        return false;
    }
}

// Helper para queries
export async function query(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

// Helper para transações
export async function transaction(callback) {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

// Helper para paginação
export async function paginate(sql, params = [], page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    // Query de contagem
    const countSql = sql.replace(/SELECT .+ FROM/, 'SELECT COUNT(*) as total FROM').replace(/ORDER BY .+$/, '');
    const [[{ total }]] = await pool.execute(countSql, params);

    // Query com paginação
    const paginatedSql = `${sql} LIMIT ? OFFSET ?`;
    const [rows] = await pool.execute(paginatedSql, [...params, limit, offset]);

    return {
        data: rows,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasMore: page * limit < total
        }
    };
}

export default pool;

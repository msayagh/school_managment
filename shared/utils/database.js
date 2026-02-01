const mysql = require('mysql2/promise');
const log4js = require('log4js');

const logger = log4js.getLogger('database');
logger.level = process.env.LOG_LEVEL || 'info';

let pool = null;

/**
 * Initialize database connection pool
 * @returns {Promise<mysql.Pool>} Database connection pool
 */
function initializePool() {
  if (pool) {
    return pool;
  }

  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'school_management',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };

  // Validate port is a valid number
  if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
    logger.error('Invalid DB_PORT value', { port: process.env.DB_PORT });
    config.port = 3306;
  }

  logger.info('Initializing database connection pool', {
    host: config.host,
    port: config.port,
    database: config.database
  });

  pool = mysql.createPool(config);
  return pool;
}

/**
 * Get database connection pool
 * @returns {mysql.Pool} Database connection pool
 */
function getPool() {
  if (!pool) {
    return initializePool();
  }
  return pool;
}

/**
 * Execute a query
 * @param {string} sql SQL query
 * @param {Array} params Query parameters
 * @returns {Promise<Array>} Query results
 */
async function query(sql, params = []) {
  const connection = await getPool().getConnection();
  try {
    logger.debug('Executing query', { sql, params });
    const [results] = await connection.execute(sql, params);
    return results;
  } catch (error) {
    logger.error('Query execution failed', { sql, params, error: error.message });
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Close database connection pool
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}

module.exports = {
  initializePool,
  getPool,
  query,
  closePool
};

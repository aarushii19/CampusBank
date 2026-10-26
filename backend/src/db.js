const mysql = require('mysql2/promise');

function createPool(config = process.env) {
  return mysql.createPool({
    host: config.DB_HOST || '127.0.0.1',
    port: Number(config.DB_PORT || 3306),
    user: config.DB_USER || 'root',
    password: config.DB_PASSWORD || '',
    database: config.DB_NAME || 'bank_management',
    waitForConnections: true,
    connectionLimit: Number(config.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    decimalNumbers: true,
    timezone: 'Z'
  });
}

module.exports = { createPool };

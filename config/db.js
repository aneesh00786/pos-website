const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'busskit_new',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  timezone: 'Z',
  dateStrings: true
};

const pool = mysql.createPool(dbConfig);

// Helper query function with error handling
async function query(sql, params = []) {
  try {
    const [rows, fields] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    console.error(`[POS Database Query Failed]: ${error.message}`);
    throw error;
  }
}

// Test connection on startup
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`[POS DB] Connected successfully to MySQL database "${dbConfig.database}" on ${dbConfig.host}`);
    connection.release();
  } catch (err) {
    console.error(`[POS DB Connection Error]: ${err.message}`);
  }
})();

module.exports = {
  pool,
  query
};

const mysql = require('mysql2/promise');
require('dotenv').config();
const logger = require('./utils/logger');

/**
 * MySQL Database Connection - Simple and Direct
 */
const pool = mysql.createPool(process.env.DATABASE_URL);

/**
 * Initialize database tables using MySQL InnoDB schema.
 */
async function initDB() {
  try {
    // MySQL InnoDB schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        age INT,
        gender VARCHAR(10),
        zodiac VARCHAR(50),
        language VARCHAR(10),
        role VARCHAR(20) DEFAULT 'user',
        state VARCHAR(20) DEFAULT 'idle',
        waiting_at DATETIME,
        report_count INT DEFAULT 0,
        report_spam_count INT DEFAULT 0,
        report_harassment_count INT DEFAULT 0,
        report_inappropriate_count INT DEFAULT 0,
        report_other_count INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user1_telegram_id BIGINT NOT NULL,
        user2_telegram_id BIGINT NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        is_active BOOLEAN DEFAULT TRUE,
        INDEX idx_chats_users (user1_telegram_id, user2_telegram_id)
      ) ENGINE=InnoDB
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id INT NOT NULL,
        sender_telegram_id BIGINT,
        content TEXT,
        media_type VARCHAR(50),
        media_file_id TEXT,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        INDEX idx_messages_chat_id (chat_id)
      ) ENGINE=InnoDB
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reporter_id INT,
        reported_id INT NOT NULL,
        reason TEXT NOT NULL,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_reports_reported (reported_id)
      ) ENGINE=InnoDB
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reputations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rater_telegram_id BIGINT NOT NULL,
        rated_telegram_id BIGINT NOT NULL,
        score INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(rater_telegram_id, rated_telegram_id)
      ) ENGINE=InnoDB
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        \`key\` VARCHAR(255) PRIMARY KEY,
        data TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sessions_updated (updated_at)
      ) ENGINE=InnoDB
    `);

    logger.info('Database tables initialized successfully');
  } catch (err) {
    logger.error(err, 'Error initializing database:');
    throw err;
  }
}

/**
 * Simple query wrapper
 */
async function query(sql, params = []) {
  try {
    const [results] = await pool.query(sql, params);
    return results;
  } catch (err) {
    logger.error({ sql, err: err.message }, 'Database query failed');
    throw err;
  }
}

/**
 * Simple queryOne wrapper
 */
async function queryOne(sql, params = []) {
  try {
    const [results] = await pool.query(sql, params);
    return results[0];
  } catch (err) {
    logger.error({ sql, err: err.message }, 'Database queryOne failed');
    throw err;
  }
}

/**
 * Transaction wrapper
 */
async function transaction(fn) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    // Create transaction context with query and queryOne methods
    const tx = {
      query: (sql, params = []) => connection.query(sql, params),
      queryOne: (sql, params = []) => connection.queryOne(sql, params)
    };
    
    const result = await fn(tx);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Close database connections
 */
async function close() {
  await pool.end();
}

// Backward compatibility wrapper - provides the old db interface
const db = {
  query,
  queryOne,
  transaction,
  initDB,
  close
};

module.exports = { db, initDB };
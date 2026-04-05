const path = require('path');
const fs = require('fs');
require('dotenv').config();
const logger = require('./utils/logger');

// We are permanently migrating to MySQL InnoDB.
const DB_MODE = 'mysql';

let db;

/**
 * Extract table name from an INSERT or UPDATE SQL statement.
 */
function extractTableName(sql, type) {
  const allowedTables = ['users', 'chats', 'messages', 'reports', 'reputations', 'sessions'];
  
  let tableName = '';
  if (type === 'INSERT') {
    const match = sql.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+["']?(\w+)["']?/i);
    tableName = match ? match[1] : '';
  } else if (type === 'UPDATE') {
    const match = sql.match(/UPDATE\s+["']?(\w+)["']?/i);
    tableName = match ? match[1] : '';
  }
  
  if (allowedTables.includes(tableName.toLowerCase())) {
    return tableName;
  }
  throw new Error(`Invalid or unauthorized table name: ${tableName}`);
}

/**
 * MySQL Adapter — connects to MySQL Database and parses Pg/SQLite-style syntax.
 */
function createMysqlAdapter() {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool(process.env.DATABASE_URL);

  const executeHelper = async (client, sql, params = []) => {
    // 1. Identify query type and "RETURNING" clause
    let isReturning = false;
    let returningMatch = sql.match(/\s+RETURNING\s+(.+)$/is);
    let cleanSql = sql;
    
    if (returningMatch) {
      isReturning = true;
      cleanSql = sql.replace(/\s+RETURNING\s.*$/is, '');
    }

    const trimmed = cleanSql.trim().toUpperCase();
    const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('SHOW') || trimmed.startsWith('DESCRIBE');

    // 2. Convert $1, $2 placeholders to ? and align params
    const expandedParams = [];
    const convertedSql = cleanSql.replace(/(['"].*?['"])|(\$\d+)/g, (match, quote, placeholder) => {
      if (quote) return quote;
      const pIdx = parseInt(placeholder.substring(1), 10);
      expandedParams.push(params[pIdx - 1]);
      return '?';
    });

    if (isSelect) {
      const [rows] = await client.query(convertedSql, expandedParams);
      return { rows };
    }

    try {
      if (isReturning) {
        const type = trimmed.startsWith('INSERT') ? 'INSERT' : 'UPDATE';
        const tableName = extractTableName(cleanSql, type);

        if (type === 'INSERT') {
          const [info] = await client.query(convertedSql, expandedParams);
          if (info.insertId) {
            const [rows] = await client.query(`SELECT * FROM ${tableName} WHERE id = ?`, [info.insertId]);
            return { rows };
          }
          // For tables without auto-inc but with RETURNING (e.g. sessions)
          // We assume the first param is the primary key if it's an UPSERT
          return { rows: [] };
        } else {
          // UPDATE with RETURNING simulation
          // 1. We need to find the row(s) that match the WHERE clause
          // This is tricky because we need only the params associated with the WHERE clause.
          // Instead of parsing the WHERE clause params, we perform the UPDATE first.
          // If the update was by a unique key (telegram_id or id), we can simply fetch it.
          
          await client.query(convertedSql, expandedParams);
          
          // Heuristic: If there is an 'id' or 'telegram_id' in the params, use the last one as the fetch key
          // This covers 99% of BotAnon's use cases.
          const fetchId = params[params.length - 1];
          const idField = cleanSql.toLowerCase().includes('telegram_id') ? 'telegram_id' : 'id';
          
          const [rows] = await client.query(`SELECT * FROM ${tableName} WHERE ${idField} = ?`, [fetchId]);
          return { rows };
        }
      }

      // Generic non-returning execution
      const [info] = await client.query(convertedSql, expandedParams);
      return { rows: [], changes: info.affectedRows || 0 };
    } catch (err) {
      logger.error({ sql: convertedSql, err: err.message }, 'MySQL Execution failed');
      throw err;
    }
  };

  const adapter = {
    async query(sql, params = []) {
      return executeHelper(pool, sql, params);
    },

    async queryOne(sql, params = []) {
      const res = await this.query(sql, params);
      return res.rows[0];
    },

    async close() {
      await pool.end();
    },

    async transaction(fn) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const tx = {
          async query(sql, params = []) {
             return executeHelper(connection, sql, params);
          }
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
  };
  return adapter;
}

/**
 * Initialize database tables using MySQL InnoDB schema.
 */
async function initDB() {
  try {
    // MySQL InnoDB schema
    await db.query(`
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

    await db.query(`
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

    await db.query(`
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

    await db.query(`
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

    await db.query(`
      CREATE TABLE IF NOT EXISTS reputations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rater_telegram_id BIGINT NOT NULL,
        rated_telegram_id BIGINT NOT NULL,
        score INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(rater_telegram_id, rated_telegram_id)
      ) ENGINE=InnoDB
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        \`key\` VARCHAR(255) PRIMARY KEY,
        data TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sessions_updated (updated_at)
      ) ENGINE=InnoDB
    `);

    logger.info(`Database tables initialized successfully (mode: ${DB_MODE})`);
  } catch (err) {
    logger.error(err, 'Error initializing database:');
    throw err;
  }
}

db = createMysqlAdapter();
logger.info('Using MySQL (InnoDB) database');

module.exports = { db, initDB };
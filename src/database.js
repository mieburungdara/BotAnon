const path = require('path');
const fs = require('fs');
require('dotenv').config();
const logger = require('./utils/logger');


const DB_MODE = (process.env.DB_MODE || 'sqlite').trim().toLowerCase();
const isPostgres = DB_MODE === 'postgresql' || DB_MODE === 'postgres';

let db;

/**
 * SQLite adapter — wraps better-sqlite3 to expose a pg-compatible query() interface.
 */
function createSqliteAdapter() {
  const Database = require('better-sqlite3');
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'botanon.db');
  // ✅ FIX Bug #71: Enable safeIntegers to prevent precision loss for large Telegram IDs
  const sqlite = new Database(dbPath, { safeIntegers: true });

  // Enable WAL mode for better concurrent performance
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  const adapter = {
    /**
     * Execute a SQL query with pg-style $1, $2 placeholders.
     */
    query(sql, params = []) {
      const expandedParams = [];
      const sqlWithoutQuotes = sql.replace(/'[^']*'/g, '___');
      
      // ✅ FIX Bug #131: Use Regex to find $n while ignoring quoted strings
      // We process the string to extract params in order of appearance
      const convertedSql = sql.replace(/(['"].*?['"])|(\$\d+)/g, (match, quote, placeholder) => {
        if (quote) return quote;
        const pIdx = parseInt(placeholder.substring(1), 10);
        expandedParams.push(params[pIdx - 1]);
        return '?';
      });

      const trimmed = convertedSql.trim().toUpperCase();

      // ✅ FIX Bug #134: Support PRAGMA and other data-returning queries
      if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA')) {
        const stmt = sqlite.prepare(convertedSql);
        const rows = stmt.all(...expandedParams);
        return { rows };
      } 
      
      const hasReturning = sql.toUpperCase().includes('RETURNING');
      if (hasReturning) {
        const type = trimmed.startsWith('INSERT') ? 'INSERT' : 'UPDATE';
        // Remove RETURNING clause for the execution phase
        const withoutReturningSql = convertedSql.replace(/\s+RETURNING\s.*$/is, '');
        
        try {
          const stmt = sqlite.prepare(withoutReturningSql);
          const info = stmt.run(...expandedParams);
          
          if (info.changes === 0 && type === 'UPDATE') return { rows: [] };
          
          const tableName = extractTableName(sql, type);
          
          if (type === 'INSERT') {
            const row = sqlite.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(info.lastInsertRowid);
            return { rows: row ? [row] : [] };
          } else {
            // ✅ FIX: Capture rows BEFORE update to handle changed WHERE conditions (e.g. is_active=TRUE -> FALSE)
            const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+RETURNING|\s*$)/is);
            let rowsBefore = [];
            if (whereMatch) {
              const rawWhere = whereMatch[1];
              const whereParams = [];
              const cleanWhere = rawWhere.replace(/(['"].*?['"])|(\$\d+)/g, (m, q, p) => {
                if (q) return q;
                const pIdx = parseInt(p.substring(1), 10);
                whereParams.push(params[pIdx - 1]);
                return '?';
              });
              rowsBefore = sqlite.prepare(`SELECT * FROM ${tableName} WHERE ${cleanWhere}`).all(...whereParams);
            }

            // Now perform the ACTUAL update
            const stmt = sqlite.prepare(withoutReturningSql);
            const info = stmt.run(...expandedParams);
            
            if (info.changes === 0) return { rows: [] };
            
            // Return what we captured before update (or re-fetch if precise id is certain)
            return { rows: rowsBefore };
          }
        } catch (runErr) {
          logger.error({ sql: withoutReturningSql, paramsCount: expandedParams.length, err: runErr.message }, 'SQLite execution failed');
          throw runErr;
        }
      }

      // Generic non-returning query
      try {
        const stmt = sqlite.prepare(convertedSql);
        const info = stmt.run(...expandedParams);
        return { rows: [], changes: info.changes };
      } catch (runErr) {
        logger.error({ sql: convertedSql, paramsCount: expandedParams.length, err: runErr.message }, 'SQLite generic query failed');
        throw runErr;
      }
    },

    /**
     * ✅ FIX Bug #67: Added queryOne for API consistency with PG adapter
     */
    async queryOne(sql, params = []) {
      const res = this.query(sql, params);
      return res.rows[0];
    },

    close() {
      sqlite.close();
    },

    async transaction(fn) {
      let txActive = false;
      try {
        sqlite.exec('BEGIN IMMEDIATE');
        txActive = true;
        const tx = {
          query: async (sql, params) => adapter.query(sql, params)
        };
        const result = await fn(tx);
        sqlite.exec('COMMIT');
        txActive = false;
        return result;
      } catch (err) {
        if (txActive) sqlite.exec('ROLLBACK');
        throw err;
      }
    }
  };
  return adapter;
}

/**
 * Extract table name from an INSERT or UPDATE SQL statement.
 */
function extractTableName(sql, type) {
  const allowedTables = ['users', 'chats', 'messages', 'reports', 'reputations', 'sessions'];
  
  // ✅ FIX Bug #62: Improved regex to handle quotes and various formatting
  let tableName = '';
  if (type === 'INSERT') {
    const match = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+["']?(\w+)["']?/i);
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
 * PostgreSQL adapter — wraps pg Pool.
 */
function createPgAdapter() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  return {
    /**
     * Execute a SQL query.
     * @param {string} sql - SQL query with $1, $2... placeholders
     * @param {Array} params - Query parameters
     * @returns {Promise<{ rows: Array<object> }>} Query result
     */
    async query(sql, params = []) {
      const res = await pool.query(sql, params);
      return res;
    },

    /**
     * Execute a SQL query and return the first row, or undefined.
     * @param {string} sql - SQL query with $1, $2... placeholders
     * @param {Array} params - Query parameters
     * @returns {Promise<object | undefined>} The first row of the result, or undefined
     */
    async queryOne(sql, params = []) {
      const res = await pool.query(sql, params);
      return res.rows[0];
    },

    /** Close the pg pool. */
    async close() {
      await pool.end();
    },

    /** Run a transaction (async for pg). */
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx = {
          query: (sql, params) => client.query(sql, params)
        };
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (rbErr) { /* ignore rollback errors */ }
        throw e;
      } finally {
        client.release();
      }
    },

    /** Expose pool for advanced usage. */
    pool,
  };
}

/**
 * Initialize database tables. Supports both SQLite and PostgreSQL schemas.
 */
async function initDB() {
  try {
    // SQLite uses INTEGER PRIMARY KEY AUTOINCREMENT, pg uses SERIAL
    // SQLite doesn't have TIMESTAMP WITH TIME ZONE, use TEXT instead
    if (DB_MODE === 'sqlite') {
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          telegram_id BIGINT UNIQUE NOT NULL,
          username VARCHAR(255),
          first_name VARCHAR(255),
          last_name VARCHAR(255),
          age INTEGER,
          gender VARCHAR(10),
          zodiac TEXT,
          language VARCHAR(10),
          role TEXT DEFAULT 'user',
          state VARCHAR(20) DEFAULT 'idle',
          waiting_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS chats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user1_telegram_id BIGINT NOT NULL,
          user2_telegram_id BIGINT NOT NULL,
          started_at TEXT DEFAULT (datetime('now')),
          ended_at TEXT,
          is_active BOOLEAN DEFAULT TRUE
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          key TEXT PRIMARY KEY,
          data TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // ✅ CLEAN MIGRATION: Check columns before adding them to avoid noisy Error logs
      const userCols = await db.query("PRAGMA table_info(users)");
      const existingUserCols = userCols.rows.map(c => c.name.toLowerCase());
      
      const reportCols = ['report_count', 'report_spam_count', 'report_harassment_count', 'report_inappropriate_count', 'report_other_count', 'waiting_at'];
      for (const col of reportCols) {
        if (!existingUserCols.includes(col.toLowerCase())) {
          const typeArr = col === 'waiting_at' ? 'TEXT' : 'INTEGER DEFAULT 0';
          await db.query(`ALTER TABLE users ADD COLUMN ${col} ${typeArr}`);
        }
      }
      
      // ✅ DROP Legacy Table
      await db.query(`DROP TABLE IF EXISTS matchmaking_queue`);
      
      // Migrate chats table (BIGINT Telegram IDs)
      const chatCols = await db.query("PRAGMA table_info(chats)");
      const existingChatCols = chatCols.rows.map(c => c.name.toLowerCase());
      
      if (!existingChatCols.includes('user1_telegram_id')) {
        await db.query(`ALTER TABLE chats ADD COLUMN user1_telegram_id BIGINT`);
      }
      if (!existingChatCols.includes('user2_telegram_id')) {
        await db.query(`ALTER TABLE chats ADD COLUMN user2_telegram_id BIGINT`);
      }
      
      // Data migration for old chats (Hanya jika kolom lama ada dan kolom baru kosong)
      const hasOldUserCols = existingChatCols.includes('user1_id') || existingChatCols.includes('user2_id');
      if (hasOldUserCols) {
         await db.query(`
           UPDATE chats 
           SET 
             user1_telegram_id = (SELECT telegram_id FROM users WHERE id = user1_id),
             user2_telegram_id = (SELECT telegram_id FROM users WHERE id = user2_id)
           WHERE user1_telegram_id IS NULL OR user2_telegram_id IS NULL
         `);
      }

      // Add missing columns to messages table
      const msgCols = await db.query("PRAGMA table_info(messages)");
      const existingMsgCols = msgCols.rows.map(c => c.name.toLowerCase());
      
      if (!existingMsgCols.includes('media_type')) {
        await db.query(`ALTER TABLE messages ADD COLUMN media_type TEXT`);
      }
      if (!existingMsgCols.includes('media_file_id')) {
        await db.query(`ALTER TABLE messages ADD COLUMN media_file_id TEXT`);
      }
      
      // Add Indexes for SQLite
      await db.query(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_chats_users ON chats(user1_telegram_id, user2_telegram_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_users_waiting ON users(state, language, waiting_at)`);
    } else {
      // PostgreSQL schema (original)
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          telegram_id BIGINT UNIQUE NOT NULL,
          username VARCHAR(255),
          first_name VARCHAR(255),
          last_name VARCHAR(255),
          age INTEGER,
          gender VARCHAR(10),
          zodiac VARCHAR(50),
          language VARCHAR(10),
          role VARCHAR(20) DEFAULT 'user',
          state VARCHAR(20) DEFAULT 'idle',
          waiting_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS chats (
          id SERIAL PRIMARY KEY,
          user1_telegram_id BIGINT NOT NULL,
          user2_telegram_id BIGINT NOT NULL,
          started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          ended_at TIMESTAMP WITH TIME ZONE,
          is_active BOOLEAN DEFAULT TRUE
        )
      `);

      await db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
        sender_telegram_id BIGINT,
        content TEXT,
        media_type VARCHAR(50),
        media_file_id TEXT,
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create reports table for PostgreSQL
    await db.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reported_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create reputations table for PostgreSQL
    await db.query(`
      CREATE TABLE IF NOT EXISTS reputations (
        id SERIAL PRIMARY KEY,
        rater_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        rated_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        score INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(rater_id, rated_id)
      )
    `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          key VARCHAR(255) PRIMARY KEY,
          data TEXT,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add report_count columns safely if they don't exist
      const cols = ['report_count', 'report_spam_count', 'report_harassment_count', 'report_inappropriate_count', 'report_other_count'];
      for (const col of cols) {
        try {
          if (col === 'waiting_at') {
             await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS waiting_at TIMESTAMP WITH TIME ZONE`);
          } else {
             await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col} INTEGER DEFAULT 0`);
          }
        } catch (e) {
          // Ignore
        }
      }

      try {
        await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS zodiac VARCHAR(50)`);
      } catch(e) {}

      try {
        await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'`);
      } catch(e) {}

      try {
        await db.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50)`);
        await db.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_file_id TEXT`);
      } catch(e) {}
      
      // MIGRASI: Tambahkan kolom telegram_id ke chats untuk backward compatibility
      try {
        // Cek apakah kolom lama masih ada (hanya untuk migrasi dari versi sebelumnya)
        const checkOldCols = DB_MODE === 'sqlite' 
          ? await db.query("PRAGMA table_info(chats)")
          : await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'chats'");
          
        const hasOldUserCols = DB_MODE === 'sqlite'
          ? checkOldCols.rows.some(c => c.name === 'user1_id' || c.name === 'user2_id')
          : checkOldCols.rows.some(c => c.column_name === 'user1_id' || c.column_name === 'user2_id');
        
        await db.query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS user1_telegram_id BIGINT`);
        await db.query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS user2_telegram_id BIGINT`);
        
        // Migrasikan data yang sudah ada HANYA jika kolom lama masih ada
        if (hasOldUserCols) {
          await db.query(`
            UPDATE chats 
            SET 
              user1_telegram_id = (SELECT telegram_id FROM users WHERE id = user1_id),
              user2_telegram_id = (SELECT telegram_id FROM users WHERE id = user2_id)
          `);
        }
      } catch (e) {
        // Kolom sudah ada atau tabel baru, ignore
      }

      await db.query(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_chats_users ON chats(user1_telegram_id, user2_telegram_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_users_waiting ON users(state, language, waiting_at)`);
    }

    logger.info(`Database tables initialized successfully (mode: ${DB_MODE})`);
  } catch (err) {
    logger.error(err, 'Error initializing database:');
    throw err;
  }
}

// Create the adapter based on mode
if (DB_MODE === 'sqlite') {
  db = createSqliteAdapter();
  logger.info('Using SQLite database');
} else if (DB_MODE === 'postgresql') {
  db = createPgAdapter();
  logger.info('Using PostgreSQL database');
  } else {
    logger.error(`Unknown DB_MODE: ${DB_MODE}. Use "sqlite" or "postgresql".`);
    // FIX Bug #14: Throw error instead of process.exit(1) to allow graceful shutdown
    throw new Error(`Unknown DB_MODE: ${DB_MODE}. Use "sqlite" or "postgresql".`);
  }

module.exports = { db, initDB };
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const logger = require('./utils/logger');


const DB_MODE = (process.env.DB_MODE || 'sqlite').toLowerCase();

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
  const sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  return {
    /**
     * Execute a SQL query with pg-style $1, $2 placeholders.
     * @param {string} sql - SQL query with $1, $2... placeholders
     * @param {Array} params - Query parameters
     * @returns {{ rows: Array<object> }} pg-compatible result
     */
    query(sql, params = []) {
      // Convert pg-style $1, $2 to sqlite-style ? and expand params
      // to handle reused placeholders (e.g. $1 used twice)
      const expandedParams = [];
      const convertedSql = sql.replace(/\$(\d+)/g, (_, num) => {
        expandedParams.push(params[parseInt(num, 10) - 1]);
        return '?';
      });

      // Determine query type
      const trimmed = convertedSql.trim().toUpperCase();

      if (trimmed.startsWith('SELECT')) {
        const stmt = sqlite.prepare(convertedSql);
        const rows = stmt.all(...expandedParams);
        return { rows };
      } else if (trimmed.startsWith('INSERT') && convertedSql.toUpperCase().includes('RETURNING')) {
        // Handle RETURNING clause — SQLite doesn't support it natively
        // FIX Bug #8: More robust regex that handles various RETURNING patterns
        const withoutReturning = convertedSql.replace(/\s+RETURNING\s+(?:\*|\w+(?:\s*,\s*\w+)*)/i, '');
        const stmt = sqlite.prepare(withoutReturning);
        const info = stmt.run(...expandedParams);
        // If INSERT was ignored (e.g. INSERT OR IGNORE conflict), return empty rows
        if (info.changes === 0) return { rows: [] };
        // Fetch the inserted row
        const tableName = extractTableName(convertedSql, 'INSERT');
        const row = sqlite.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(info.lastInsertRowid);
        return { rows: row ? [row] : [] };
      } else if (trimmed.startsWith('UPDATE') && convertedSql.toUpperCase().includes('RETURNING')) {
        // Handle UPDATE ... RETURNING *
        // FIX Bug #8: More robust regex that handles various RETURNING patterns
        const withoutReturning = convertedSql.replace(/\s+RETURNING\s+(?:\*|\w+(?:\s*,\s*\w+)*)/i, '');
        const stmt = sqlite.prepare(withoutReturning);
        stmt.run(...expandedParams);
        
        // Fetch the updated row using the WHERE clause condition
        const tableName = extractTableName(convertedSql, 'UPDATE');
        // Match the first column=value pattern in WHERE clause to find the unique key
        // FIX Bug #46: Use regex to find the first WHERE clause (not inside subqueries)
        const whereMatch = convertedSql.match(/WHERE\s+(.+?)(?:\s+RETURNING|\s*$)/is);
        if (whereMatch) {
          const conditions = whereMatch[1];
          // Count placeholders before the first WHERE by finding its position
          const firstWhereIdx = convertedSql.search(/WHERE\s/i);
          const beforeWhere = firstWhereIdx >= 0 ? convertedSql.substring(0, firstWhereIdx) : '';
          const placeholdersBeforeWhere = (beforeWhere.match(/\?/g) || []).length;
          
          const colMatches = [...conditions.matchAll(/(\w+)\s*=\s*\?/g)];
          if (colMatches.length > 0) {
            const whereParts = [];
            const whereParams = [];
            colMatches.forEach((m, i) => {
              whereParts.push(`${m[1]} = ?`);
              whereParams.push(expandedParams[placeholdersBeforeWhere + i]);
            });
            const row = sqlite.prepare(`SELECT * FROM ${tableName} WHERE ${whereParts.join(' AND ')}`).get(...whereParams);
            return { rows: row ? [row] : [] };
          }
        }
        return { rows: [] };
      } else {
        // CREATE TABLE, generic INSERT/UPDATE/DELETE without RETURNING
        const stmt = sqlite.prepare(convertedSql);
        stmt.run(...expandedParams);
        return { rows: [] };
      }
    },

    /** Close the SQLite connection. */
    close() {
      sqlite.close();
    },

    /** Run a transaction (async for sqlite). */
    async transaction(fn) {
      let txActive = false;
      try {
        sqlite.exec('BEGIN IMMEDIATE');
        txActive = true;
        
        // Transaction-scoped query method that uses the same connection
        const tx = {
          query: async (sql, params) => {
            // Convert pg-style $1, $2 to sqlite-style ? and expand params
            const expandedParams = [];
            const convertedSql = sql.replace(/\$(\d+)/g, (_, num) => {
              expandedParams.push(params[parseInt(num, 10) - 1]);
              return '?';
            });

            const trimmed = convertedSql.trim().toUpperCase();

            if (trimmed.startsWith('SELECT')) {
              const stmt = sqlite.prepare(convertedSql);
              const rows = stmt.all(...expandedParams);
              return { rows };
            } else if (trimmed.startsWith('INSERT') && convertedSql.toUpperCase().includes('RETURNING')) {
              const withoutReturning = convertedSql.replace(/\s+RETURNING\s+(?:\*|\w+(?:\s*,\s*\w+)*)/i, '');
              const stmt = sqlite.prepare(withoutReturning);
              const info = stmt.run(...expandedParams);
              if (info.changes === 0) return { rows: [] };
              const tableName = extractTableName(convertedSql, 'INSERT');
              const row = sqlite.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(info.lastInsertRowid);
              return { rows: row ? [row] : [] };
            } else if (trimmed.startsWith('UPDATE') && convertedSql.toUpperCase().includes('RETURNING')) {
              const withoutReturning = convertedSql.replace(/\s+RETURNING\s+(?:\*|\w+(?:\s*,\s*\w+)*)/i, '');
              const stmt = sqlite.prepare(withoutReturning);
              stmt.run(...expandedParams);
              const tableName = extractTableName(convertedSql, 'UPDATE');
              // FIX Bug #46: Use regex to find the first WHERE clause (not inside subqueries)
              const whereMatch = convertedSql.match(/WHERE\s+(.+?)(?:\s+RETURNING|\s*$)/is);
              if (whereMatch) {
                const conditions = whereMatch[1];
                const firstWhereIdx = convertedSql.search(/WHERE\s/i);
                const beforeWhere = firstWhereIdx >= 0 ? convertedSql.substring(0, firstWhereIdx) : '';
                const placeholdersBeforeWhere = (beforeWhere.match(/\?/g) || []).length;
                const colMatches = [...conditions.matchAll(/(\w+)\s*=\s*\?/g)];
                if (colMatches.length > 0) {
                  const whereParts = [];
                  const whereParams = [];
                  colMatches.forEach((m, i) => {
                    whereParts.push(`${m[1]} = ?`);
                    whereParams.push(expandedParams[placeholdersBeforeWhere + i]);
                  });
                  const row = sqlite.prepare(`SELECT * FROM ${tableName} WHERE ${whereParts.join(' AND ')}`).get(...whereParams);
                  return { rows: row ? [row] : [] };
                }
              }
              return { rows: [] };
            } else {
              const stmt = sqlite.prepare(convertedSql);
              stmt.run(...expandedParams);
              return { rows: [] };
            }
          }
        };
        const result = await fn(tx);
        if (txActive && sqlite.inTransaction) {
          sqlite.exec('COMMIT');
          txActive = false; // ✅ Tandai transaksi sudah selesai, tidak perlu rollback lagi
        }
        return result;
      } catch (err) {
        if (txActive && sqlite.inTransaction) {
          sqlite.exec('ROLLBACK');
          txActive = false;
        }
        throw err;
      } finally {
        // ✅ FINALLY GUARD: Jaminan 100% transaksi tidak akan pernah dibiarkan terbuka
        // Ini akan selalu berjalan APAPUN yang terjadi: throw, return, break, dll
        if (txActive && sqlite.inTransaction) {
          try { sqlite.exec('ROLLBACK'); } catch (e) {}
        }
      }
    }
  };
}

/**
 * Extract table name from an INSERT or UPDATE SQL statement.
 * @param {string} sql - The SQL statement
 * @param {string} type - 'INSERT' or 'UPDATE'
 * @returns {string} The table name
 */
function extractTableName(sql, type) {
  const allowedTables = ['users', 'chats', 'messages', 'reports', 'ratings', 'sessions', 'bans'];
  
  let tableName = '';
  if (type === 'INSERT') {
    const match = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i);
    tableName = match ? match[1] : '';
  } else if (type === 'UPDATE') {
    const match = sql.match(/UPDATE\s+(\w+)/i);
    tableName = match ? match[1] : '';
  }
  
  // ✅ WHITELIST PROTECTION: Hanya tabel yang diijinkan yang bisa diakses
  if (allowedTables.includes(tableName.toLowerCase())) {
    return tableName;
  }
  throw new Error(`Invalid table name: ${tableName}`);
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
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS chats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user1_id INTEGER REFERENCES users(id),
          user2_id INTEGER REFERENCES users(id),
          started_at TEXT DEFAULT (datetime('now')),
          ended_at TEXT,
          is_active BOOLEAN DEFAULT TRUE
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id INTEGER REFERENCES chats(id),
          sender_telegram_id BIGINT,
          content TEXT,
          media_type TEXT,
          media_file_id TEXT,
          sent_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // Create reports table for SQLite
      await db.query(`
        CREATE TABLE IF NOT EXISTS reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reporter_id INTEGER REFERENCES users(id),
          reported_id INTEGER REFERENCES users(id),
          reason TEXT NOT NULL,
          details TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

       // Create reputations table for SQLite
       await db.query(`
         CREATE TABLE IF NOT EXISTS reputations (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           rater_id INTEGER REFERENCES users(id),
           rated_id INTEGER REFERENCES users(id),
           score INTEGER NOT NULL,
           created_at TEXT DEFAULT (datetime('now')),
           UNIQUE(rater_id, rated_id)
         )
       `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          key TEXT PRIMARY KEY,
          data TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // Add report_count columns safely if they don't exist
      const cols = ['report_count', 'report_spam_count', 'report_harassment_count', 'report_inappropriate_count', 'report_other_count'];
      for (const col of cols) {
        try {
          await db.query(`ALTER TABLE users ADD COLUMN ${col} INTEGER DEFAULT 0`);
        } catch (e) {
          // Column likely already exists, ignore
        }
      }

      // FIX Bug #9: Removed redundant ALTER TABLE for zodiac and role columns
      // These columns are already defined in the CREATE TABLE statement above (lines 217, 219)
      // Adding them again via ALTER TABLE is wasteful and confusing, even with try/catch.

      // Add new columns to messages (SQLite way)
      try {
        await db.query(`ALTER TABLE messages ADD COLUMN media_type TEXT`);
        await db.query(`ALTER TABLE messages ADD COLUMN media_file_id TEXT`);
      } catch(e) {}
      
      // Add Indexes for SQLite
      await db.query(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_chats_users ON chats(user1_id, user2_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at)`);
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
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS chats (
          id SERIAL PRIMARY KEY,
          user1_id INTEGER REFERENCES users(id),
          user2_id INTEGER REFERENCES users(id),
          started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          ended_at TIMESTAMP WITH TIME ZONE,
          is_active BOOLEAN DEFAULT TRUE
        )
      `);

      await db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER REFERENCES chats(id),
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
        reporter_id INTEGER REFERENCES users(id),
        reported_id INTEGER REFERENCES users(id),
        reason TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create reputations table for PostgreSQL
    await db.query(`
      CREATE TABLE IF NOT EXISTS reputations (
        id SERIAL PRIMARY KEY,
        rater_id INTEGER REFERENCES users(id),
        rated_id INTEGER REFERENCES users(id),
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
          await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col} INTEGER DEFAULT 0`);
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

      // Add Indexes for PostgreSQL
      await db.query(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_chats_users ON chats(user1_id, user2_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at)`);
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
/**
 * User Service — all user-related database operations.
 */
const { db } = require('../database');
const logger = require('../utils/logger');

async function getUserByTelegramId(telegramId) {
  try {
    const res = await db.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId.toString()]);
    return res.rows[0];
  } catch (err) {
    logger.error(err, `Error in getUserByTelegramId (${telegramId})`);
    return undefined;
  }
}

async function getUserById(id) {
  try {
    const res = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0];
  } catch (err) {
    logger.error(err, `Error in getUserById (${id})`);
    return undefined;
  }
}

async function createUser(telegramId, username, firstName, lastName) {
  try {
    const DB_MODE = (process.env.DB_MODE || 'sqlite').toLowerCase();
    const sql = DB_MODE === 'sqlite'
      ? 'INSERT OR IGNORE INTO users (telegram_id, username, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING *'
      : 'INSERT INTO users (telegram_id, username, first_name, last_name) VALUES ($1, $2, $3, $4) ON CONFLICT (telegram_id) DO NOTHING RETURNING *';
    const res = await db.query(sql, [telegramId.toString(), username, firstName, lastName]);
    return (res.rows && res.rows.length > 0) ? res.rows[0] : await getUserByTelegramId(telegramId);
  } catch (err) {
    logger.error(err, `Error in createUser (${telegramId})`);
    return undefined;
  }
}

async function updateUserProfile(telegramId, age, gender, language) {
  try {
    const res = await db.query(
      'UPDATE users SET age = COALESCE($1, age), gender = COALESCE($2, gender), language = COALESCE($3, language), updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $4 RETURNING *',
      [age, gender, language, telegramId.toString()]
    );
    return res.rows[0];
  } catch (err) {
    logger.error(err, `Error in updateUserProfile (${telegramId})`);
    return undefined;
  }
}

async function updateUserState(telegramId, state) {
  try {
    const res = await db.query(
      'UPDATE users SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2 RETURNING *',
      [state, telegramId.toString()]
    );
    return res.rows[0];
  } catch (err) {
    logger.error(err, `Error in updateUserState (${telegramId})`);
    return undefined;
  }
}

async function updateUserZodiac(telegramId, zodiac) {
  try {
    const res = await db.query(
      'UPDATE users SET zodiac = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2 RETURNING *',
      [zodiac, telegramId.toString()]
    );
    return res.rows[0];
  } catch (err) {
    logger.error(err, `Error in updateUserZodiac (${telegramId})`);
    return undefined;
  }
}

async function syncUserIdentity(tid, uname, fname, lname) {
  try {
    await db.query('UPDATE users SET username = $1, first_name = $2, last_name = $3, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $4', [uname, fname, lname, tid.toString()]);
  } catch (err) {
    logger.error(err, 'Sync identity error');
  }
}

module.exports = {
  getUserByTelegramId,
  getUserById,
  createUser,
  updateUserProfile,
  updateUserState,
  updateUserZodiac,
  syncUserIdentity,
};

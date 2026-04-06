/**
 * User Service — all user-related database operations.
 */
const { db } = require('../database');
const logger = require('../utils/logger');

/**
 * Get user from DB by their Telegram ID safely using BigInt.
 * @param {number|string} telegramId 
 * @param {object} tx Optional transaction client
 */
async function getUserByTelegramId(telegramId, tx = db) {
  try {
    // ✅ Use BigInt to prevent 64-bit overflow in JS
    const tid = BigInt(telegramId);
    const res = await tx.query('SELECT * FROM users WHERE telegram_id = $1', [tid]);
    return res.rows[0];
  } catch (err) {
    logger.error({ err, telegramId }, 'Error in getUserByTelegramId');
    return undefined;
  }
}

/**
 * Get user by internal Database ID.
 */
async function getUserById(id, tx = db) {
  try {
    const res = await tx.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0];
  } catch (err) {
    logger.error({ err, id }, 'Error in getUserById');
    return undefined;
  }
}

/**
 * Create a new user with BigInt safety.
 */
async function createUser(telegramId, username, firstName, lastName, tx = db) {
  try {
    const tid = BigInt(telegramId);
    const sql = 'INSERT IGNORE INTO users (telegram_id, username, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING *';
    
    const res = await tx.query(sql, [tid, username, firstName, lastName]);
    
    // If user already existed, fetch them using the same transaction
    return (res.rows && res.rows.length > 0) ? res.rows[0] : await getUserByTelegramId(telegramId, tx);
  } catch (err) {
    logger.error({ err, telegramId }, 'Error in createUser');
    return undefined;
  }
}

/**
 * Update user age, gender, and language.
 */
async function updateUserProfile(telegramId, age, gender, language, tx = db) {
  try {
    const tid = BigInt(telegramId);
    
    const res = await tx.query(
      `UPDATE users SET age = COALESCE($1, age), gender = COALESCE($2, gender), language = COALESCE($3, language), updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $4 RETURNING *`,
      [age, gender, language, tid]
    );
    return res.rows[0];
  } catch (err) {
    logger.error({ err, telegramId }, 'Error in updateUserProfile');
    return undefined;
  }
}

/**
 * Update user state with Atomic Queue synchronization.
 */
async function updateUserState(telegramId, state, tx = db) {
  try {
    const tid = BigInt(telegramId);
    
    // ✅ ATOMIC UPDATE: Handle the 'waiting_at' FIFO queue inline
    let query = '';
    if (state === 'waiting') {
      query = `UPDATE users SET state = $1, waiting_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2 RETURNING id, state`;
    } else {
      query = `UPDATE users SET state = $1, waiting_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2 RETURNING id, state`;
    }
    
    const res = await tx.query(query, [state, tid]);
    const user = res.rows[0];
    
    return user;
  } catch (err) {
    logger.error({ err, telegramId: telegramId.toString(), state }, 'Error in updateUserState');
    return undefined;
  }
}

/**
 * Reset all users for system maintenance (Reset report_count and state).
 */
async function resetAllUsers() {
  try {
    await db.query(`UPDATE users SET state = 'idle', waiting_at = NULL, report_count = 0, updated_at = CURRENT_TIMESTAMP`);
    return true;
  } catch (err) {
    logger.error(err, 'Error in resetAllUsers');
    return false;
  }
}

/**
 * Update user zodiac.
 */
async function updateUserZodiac(telegramId, zodiac, tx = db) {
  try {
    const tid = BigInt(telegramId);

    const res = await tx.query(
      `UPDATE users SET zodiac = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2 RETURNING *`,
      [zodiac, tid]
    );
    return res.rows[0];
  } catch (err) {
    logger.error({ err, telegramId, zodiac }, 'Error in updateUserZodiac');
    return undefined;
  }
}

/**
 * Sync Telegram identity metadata.
 */
async function syncUserIdentity(tid, uname, fname, lname, tx = db) {
  try {
    const btid = BigInt(tid);

    const res = await tx.query(
      `UPDATE users SET username = $1, first_name = $2, last_name = $3, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $4 RETURNING *`, 
      [uname, fname, lname, btid]
    );
    return res.rows[0];
  } catch (err) {
    logger.error({ err, tid }, 'Sync identity error');
    return undefined;
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

/**
 * User Service — all user-related database operations.
 */
const { query, queryOne, transaction } = require('../database');
const logger = require('../utils/logger');

/**
 * Get user from DB by their Telegram ID safely using BigInt.
 * @param {number|string} telegramId 
 * @param {object} tx Optional transaction client
 */
async function getUserByTelegramId(telegramId, tx = null) {
  try {
    // Use provided transaction or default to direct query
    const queryFn = tx ? tx.query : query;
    // ✅ Use BigInt to prevent 64-bit overflow in JS
    const tid = BigInt(telegramId);
    const res = await queryFn('SELECT * FROM users WHERE telegram_id = ?', [tid]);
    return res[0];
  } catch (err) {
    logger.error({ err, telegramId }, 'Error in getUserByTelegramId');
    return undefined;
  }
}

/**
 * Get user by internal Database ID.
 */
async function getUserById(id, tx = null) {
  try {
    // Use provided transaction or default to direct query
    const queryFn = tx ? tx.query : query;
    const res = await queryFn('SELECT * FROM users WHERE id = ?', [id]);
    return res[0];
  } catch (err) {
    logger.error({ err, id }, 'Error in getUserById');
    return undefined;
  }
}

/**
 * Create a new user with BigInt safety.
 */
async function createUser(telegramId, username, firstName, lastName, tx = null) {
  try {
    const tid = BigInt(telegramId);
    const sql = 'INSERT IGNORE INTO users (telegram_id, username, first_name, last_name) VALUES (?, ?, ?, ?)';
    
    // Use provided transaction or default to direct query
    const queryFn = tx ? tx.query : query;
    const info = await queryFn(sql, [tid, username, firstName, lastName]);
    
    // If user already existed, fetch them using the same transaction
    if (info.affectedRows > 0) {
      // New user was inserted
      const res = await queryFn('SELECT * FROM users WHERE telegram_id = ?', [tid]);
      return res[0];
    } else {
      // User already existed, fetch them
      return await getUserByTelegramId(telegramId, tx);
    }
  } catch (err) {
    logger.error({ err, telegramId }, 'Error in createUser');
    return undefined;
  }
}

/**
 * Update user age, gender, and language.
 */
async function updateUserProfile(telegramId, age, gender, language, tx = null) {
  try {
    const tid = BigInt(telegramId);
    
    // Use provided transaction or default to direct query
    const queryFn = tx ? tx.query : query;
    
    const info = await queryFn(
      `UPDATE users SET age = COALESCE(?, age), gender = COALESCE(?, gender), language = COALESCE(?, language), updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?`,
      [age, gender, language, tid]
    );
    
    if (info.affectedRows > 0) {
      const res = await queryFn('SELECT * FROM users WHERE telegram_id = ?', [tid]);
      return res[0];
    }
    return undefined;
  } catch (err) {
    logger.error({ err, telegramId }, 'Error in updateUserProfile');
    return undefined;
  }
}

/**
 * Update user state with Atomic Queue synchronization.
 */
async function updateUserState(telegramId, state, tx = null) {
  try {
    const tid = BigInt(telegramId);
    
    // Use provided transaction or default to direct query
    const queryFn = tx ? tx.query : query;
    
    // ✅ ATOMIC UPDATE: Handle the 'waiting_at' FIFO queue inline
    let sql = '';
    let params = [];
    if (state === 'waiting') {
      sql = `UPDATE users SET state = ?, waiting_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?`;
      params = [state, tid];
    } else {
      sql = `UPDATE users SET state = ?, waiting_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?`;
      params = [state, tid];
    }
    
    const info = await queryFn(sql, params);
    
    if (info.affectedRows > 0) {
      const res = await queryFn('SELECT id, state FROM users WHERE telegram_id = ?', [tid]);
      return res[0];
    }
    return undefined;
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
    await query(`UPDATE users SET state = 'idle', waiting_at = NULL, report_count = 0, updated_at = CURRENT_TIMESTAMP`);
    return true;
  } catch (err) {
    logger.error(err, 'Error in resetAllUsers');
    return false;
  }
}

/**
 * Update user zodiac.
 */
async function updateUserZodiac(telegramId, zodiac, tx = null) {
  try {
    const tid = BigInt(telegramId);
    
    // Use provided transaction or default to direct query
    const queryFn = tx ? tx.query : query;
    
    const info = await queryFn(
      `UPDATE users SET zodiac = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?`,
      [zodiac, tid]
    );
    
    if (info.affectedRows > 0) {
      const res = await queryFn('SELECT * FROM users WHERE telegram_id = ?', [tid]);
      return res[0];
    }
    return undefined;
  } catch (err) {
    logger.error({ err, telegramId, zodiac }, 'Error in updateUserZodiac');
    return undefined;
  }
}

/**
 * Sync Telegram identity metadata.
 */
async function syncUserIdentity(tid, uname, fname, lname, tx = null) {
  try {
    const btid = BigInt(tid);
    
    // Use provided transaction or default to direct query
    const queryFn = tx ? tx.query : query;
    
    const info = await queryFn(
      `UPDATE users SET username = ?, first_name = ?, last_name = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?`, 
      [uname, fname, lname, btid]
    );
    
    if (info.affectedRows > 0) {
      const res = await queryFn('SELECT * FROM users WHERE telegram_id = ?', [btid]);
      return res[0];
    }
    return undefined;
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
  syncUserIdentity
};
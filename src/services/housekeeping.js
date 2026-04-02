/**
 * Housekeeping Service — periodic cleanup of old data and zombie chats.
 */
const { db } = require('../database');
const logger = require('../utils/logger');

async function housekeeping() {
  try {
    const DB_MODE = (process.env.DB_MODE || 'sqlite').toLowerCase();
    const sqlSess = DB_MODE === 'sqlite' 
      ? "DELETE FROM sessions WHERE updated_at < datetime('now', '-30 days')"
      : "DELETE FROM sessions WHERE updated_at < CURRENT_TIMESTAMP - INTERVAL '30 days'";
    await db.query(sqlSess);

    const sqlMsgs = DB_MODE === 'sqlite'
      ? "DELETE FROM messages WHERE sent_at < datetime('now', '-7 days')"
      : "DELETE FROM messages WHERE sent_at < CURRENT_TIMESTAMP - INTERVAL '7 days'";
    await db.query(sqlMsgs);

    const closeZombiesSql = DB_MODE === 'sqlite'
      ? "UPDATE chats SET ended_at = datetime('now'), is_active = FALSE WHERE is_active = TRUE AND started_at < datetime('now', '-1 day')"
      : "UPDATE chats SET ended_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE is_active = TRUE AND started_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'";
    await db.query(closeZombiesSql);

    const resetStatesSql = DB_MODE === 'sqlite'
      ? "UPDATE users SET state = 'waiting', updated_at = datetime('now') WHERE state = 'chatting' AND id IN (SELECT user1_id FROM chats WHERE is_active = FALSE AND started_at < datetime('now', '-1 day') UNION SELECT user2_id FROM chats WHERE is_active = FALSE AND started_at < datetime('now', '-1 day'))"
      : "UPDATE users SET state = 'waiting', updated_at = CURRENT_TIMESTAMP WHERE state = 'chatting' AND id IN (SELECT user1_id FROM chats WHERE is_active = FALSE AND started_at < CURRENT_TIMESTAMP - INTERVAL '24 hours' UNION SELECT user2_id FROM chats WHERE is_active = FALSE AND started_at < CURRENT_TIMESTAMP - INTERVAL '24 hours')";
    await db.query(resetStatesSql);

    logger.info('Housekeeping: Old data cleaned and zombie chats closed.');
  } catch (err) {
    logger.error(err, 'Housekeeping failed');
  }
}

module.exports = { housekeeping };

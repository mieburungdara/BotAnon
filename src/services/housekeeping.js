/**
 * Housekeeping Service — periodic cleanup of old data and zombie chats.
 */
const { db } = require('../database');
const logger = require('../utils/logger');

async function housekeeping() {
  const DB_MODE = (process.env.DB_MODE || 'sqlite').toLowerCase();
  
  try {
    // ✅ FIX Bug #102: Batch Deletion for Messages (Max 1000 per batch)
    // Prevents database locking on SQLite and vacuum bloat on PG
    let deletedMsgs = 0;
    const msgCutoff = DB_MODE === 'sqlite' ? "datetime('now', '-7 days')" : "CURRENT_TIMESTAMP - INTERVAL '7 days'";
    while (true) {
      const res = await db.query(`DELETE FROM messages WHERE id IN (SELECT id FROM messages WHERE sent_at < ${msgCutoff} LIMIT 1000)`);
      // SQLite return changes in res.changes, PG in res.rowCount
      const count = res.changes || res.rowCount || 0;
      if (count === 0) break;
      deletedMsgs += count;
      // Yield to event loop for 10ms to keep bot responsive
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // ✅ Batch Deletion for Sessions (Max 200 per batch)
    const sessCutoff = DB_MODE === 'sqlite' ? "datetime('now', '-30 days')" : "CURRENT_TIMESTAMP - INTERVAL '30 days'";
    while (true) {
      const res = await db.query(`DELETE FROM sessions WHERE key IN (SELECT key FROM sessions WHERE updated_at < ${sessCutoff} LIMIT 200)`);
      const count = res.changes || res.rowCount || 0;
      if (count === 0) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // ✅ FIX Bug #103: Efficient Zombie Chat Cleanup
    // Close chats older than 24 hours
    const zombieCutoff = DB_MODE === 'sqlite' ? "datetime('now', '-1 day')" : "CURRENT_TIMESTAMP - INTERVAL '24 hours'";
    await db.query(`UPDATE chats SET ended_at = ${DB_MODE === 'sqlite' ? "datetime('now')" : "CURRENT_TIMESTAMP"}, is_active = FALSE WHERE is_active = TRUE AND started_at < ${zombieCutoff}`);

    // Reset user states if they are stuck in 'chatting' for an inactive chat
    const resetSql = `
      UPDATE users SET state = 'idle', updated_at = ${DB_MODE === 'sqlite' ? "datetime('now')" : "CURRENT_TIMESTAMP"} 
      WHERE state = 'chatting' AND telegram_id IN (
        SELECT user1_telegram_id FROM chats WHERE is_active = FALSE AND started_at < ${zombieCutoff}
        UNION
        SELECT user2_telegram_id FROM chats WHERE is_active = FALSE AND started_at < ${zombieCutoff}
      )
    `;
    await db.query(resetSql);
    // Sync states just in case
    await db.query("UPDATE users SET state = 'idle' WHERE state = 'waiting' AND waiting_at IS NULL");
    
    logger.info({ deletedMsgs }, 'Housekeeping: Performance-optimized cleanup completed.');
  } catch (err) {
    logger.error(err, 'Housekeeping failed');
  }
}

module.exports = { housekeeping };

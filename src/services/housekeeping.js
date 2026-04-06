/**
 * Housekeeping Service — periodic cleanup of old data and zombie chats.
 */
const { query } = require('../database');
const logger = require('../utils/logger');

async function housekeeping() {
  try {
    let deletedMsgs = 0;
    const msgCutoff = 'CURRENT_TIMESTAMP - INTERVAL 7 DAY';
    while (true) {
      const res = await query('DELETE FROM messages WHERE sent_at < ? LIMIT 1000', [msgCutoff]);
      // MySQL returns affectedRows in the result object
      const count = res.affectedRows || 0;
      if (count === 0) break;
      deletedMsgs += count;
      // Yield to event loop for 10ms to keep bot responsive
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // ✅ Batch Deletion for Sessions (Max 200 per batch)
    const sessCutoff = 'CURRENT_TIMESTAMP - INTERVAL 30 DAY';
    while (true) {
      const res = await query('DELETE FROM sessions WHERE updated_at < ? LIMIT 200', [sessCutoff]);
      const count = res.affectedRows || 0;
      if (count === 0) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // ✅ FIX Bug #103: Efficient Zombie Chat Cleanup
    // Close chats older than 24 hours
    const zombieCutoff = 'CURRENT_TIMESTAMP - INTERVAL 24 HOUR';
    await query('UPDATE chats SET ended_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE is_active = TRUE AND started_at < ?', [zombieCutoff]);

    // Reset user states if they are stuck in 'chatting' for an inactive chat
    const resetSql = `
      UPDATE users SET state = 'idle', updated_at = CURRENT_TIMESTAMP 
      WHERE state = 'chatting' AND NOT EXISTS (
        SELECT 1 FROM chats 
        WHERE is_active = TRUE 
        AND (user1_telegram_id = users.telegram_id OR user2_telegram_id = users.telegram_id)
      )
    `;
    await query(resetSql);
    // Sync states just in case
    await query("UPDATE users SET state = 'idle' WHERE state = 'waiting' AND waiting_at IS NULL");
    
    logger.info({ deletedMsgs }, 'Housekeeping: Performance-optimized cleanup completed.');
  } catch (err) {
    logger.error(err, 'Housekeeping failed');
  }
}

module.exports = { housekeeping };
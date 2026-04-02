/**
 * Chat Service — pure chat-related database operations.
 */
const { db } = require('../database');
const logger = require('../utils/logger');

async function getActiveChatByUserId(userId) {
  try {
    const res = await db.query('SELECT * FROM chats WHERE (user1_id = $1 OR user2_id = $1) AND ended_at IS NULL AND is_active = TRUE', [userId]);
    return res.rows[0];
  } catch (err) {
    logger.error(err, `Error in getActiveChatByUserId (${userId})`);
    return undefined;
  }
}

async function getLastPartnerByUserId(userId) {
  try {
    const res = await db.query('SELECT * FROM chats WHERE (user1_id = $1 OR user2_id = $1) AND user2_id IS NOT NULL ORDER BY started_at DESC LIMIT 1', [userId]);
    return res.rows[0];
  } catch (err) {
    logger.error(err, `Error in getLastPartnerByUserId (${userId})`);
    return undefined;
  }
}

async function endChat(chatId) {
  try {
    const res = await db.query('UPDATE chats SET ended_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE id = $1 RETURNING *', [chatId]);
    return res.rows[0];
  } catch (err) {
    logger.error(err, `Error in endChat (${chatId})`);
    return undefined;
  }
}

async function saveMessage(chatId, senderTelegramId, content, mediaType = null, mediaFileId = null) {
  try {
    await db.query('INSERT INTO messages (chat_id, sender_telegram_id, content, media_type, media_file_id) VALUES ($1, $2, $3, $4, $5)', [chatId, senderTelegramId, content, mediaType, mediaFileId]);
    return true;
  } catch (err) {
    logger.error(err, `Error in saveMessage (chat: ${chatId})`);
    return false;
  }
}

module.exports = {
  getActiveChatByUserId,
  getLastPartnerByUserId,
  endChat,
  saveMessage,
};

/**
 * Chat Service — pure chat-related database operations.
 */
const { db } = require('../database');
const logger = require('../utils/logger');

function getPartnerTelegramId(chat, userTelegramId) {
  if (!chat) return null;
  const tid = userTelegramId.toString();
  // Ensure DB IDs are also treated as strings for reliable comparison
  return chat.user1_telegram_id.toString() === tid 
    ? chat.user2_telegram_id.toString()
    : chat.user1_telegram_id.toString();
}

async function getActiveChatByTelegramId(telegramId, tx = db) {
  try {
    const res = await tx.query(
      'SELECT * FROM chats WHERE (user1_telegram_id = $1 OR user2_telegram_id = $1) AND ended_at IS NULL AND is_active = TRUE',
      [telegramId.toString()]
    );
    return res.rows[0];
  } catch (err) {
    logger.error(err, `Error in getActiveChatByTelegramId (${telegramId})`);
    return undefined;
  }
}

async function getLastChatByTelegramId(telegramId, tx = db) {
  try {
    const res = await tx.query(
      'SELECT * FROM chats WHERE (user1_telegram_id = $1 OR user2_telegram_id = $1) ORDER BY started_at DESC LIMIT 1',
      [telegramId.toString()]
    );
    return res.rows[0];
  } catch (err) {
    logger.error(err, `Error in getLastChatByTelegramId (${telegramId})`);
    return undefined;
  }
}

async function endChat(chatId, tx = db) {
  try {
    const res = await tx.query('UPDATE chats SET ended_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE id = $1 RETURNING *', [chatId]);
    return res.rows[0];
  } catch (err) {
    logger.error(err, `Error in endChat (${chatId})`);
    return undefined;
  }
}

async function saveMessage(chatId, senderTelegramId, content, mediaType = null, mediaFileId = null, tx = db) {
  try {
    await tx.query('INSERT INTO messages (chat_id, sender_telegram_id, content, media_type, media_file_id) VALUES ($1, $2, $3, $4, $5)', [chatId, senderTelegramId, content, mediaType, mediaFileId]);
    return true;
  } catch (err) {
    logger.error(err, `Error in saveMessage (chat: ${chatId})`);
    return false;
  }
}

module.exports = {
  getPartnerTelegramId,
  getActiveChatByTelegramId,
  getLastChatByTelegramId,
  endChat,
  saveMessage,
};

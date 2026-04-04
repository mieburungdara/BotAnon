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

async function getActiveChatByTelegramId(telegramId) {
  try {
    const res = await db.query(
      'SELECT * FROM chats WHERE (user1_telegram_id = $1 OR user2_telegram_id = $1) AND ended_at IS NULL AND is_active = TRUE',
      [telegramId.toString()]
    );
    return res.rows[0];
  } catch (err) {
    logger.error(err, `Error in getActiveChatByTelegramId (${telegramId})`);
    return undefined;
  }
}

async function getLastChatByTelegramId(telegramId) {
  try {
    const res = await db.query(
      'SELECT * FROM chats WHERE (user1_telegram_id = $1 OR user2_telegram_id = $1) ORDER BY started_at DESC LIMIT 1',
      [telegramId.toString()]
    );
    return res.rows[0];
  } catch (err) {
    logger.error(err, `Error in getLastChatByTelegramId (${telegramId})`);
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

// Backward compatibility - will be removed later
async function getActiveChatByUserId(userId) {
  logger.warn('DEPRECATED: getActiveChatByUserId() dipanggil, gunakan getActiveChatByTelegramId()');
  const user = await db.query('SELECT telegram_id FROM users WHERE id = $1', [userId]);
  if (user.rows[0]) return getActiveChatByTelegramId(user.rows[0].telegram_id);
  return undefined;
}

async function getLastPartnerByUserId(userId) {
  logger.warn('DEPRECATED: getLastPartnerByUserId() dipanggil, gunakan getLastChatByTelegramId()');
  const user = await db.query('SELECT telegram_id FROM users WHERE id = $1', [userId]);
  if (user.rows[0]) return getLastChatByTelegramId(user.rows[0].telegram_id);
  return undefined;
}

module.exports = {
  getPartnerTelegramId,
  getActiveChatByTelegramId,
  getLastChatByTelegramId,
  getActiveChatByUserId,
  getLastPartnerByUserId,
  endChat,
  saveMessage,
};

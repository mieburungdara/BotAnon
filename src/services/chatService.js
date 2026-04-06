/**
 * Chat Service — pure chat-related database operations.
 */
const { query, queryOne, transaction } = require('../database');
const logger = require('../utils/logger');

function getPartnerTelegramId(chat, userTelegramId) {
  if (!chat) return null;
  const tid = userTelegramId.toString();
  // Ensure DB IDs are also treated as strings for reliable comparison
  return chat.user1_telegram_id.toString() === tid 
    ? chat.user2_telegram_id.toString()
    : chat.user1_telegram_id.toString();
}

async function getActiveChatByTelegramId(telegramId, tx = null) {
  try {
    const queryFn = tx ? tx.query : query;
    const res = await queryFn(
      'SELECT * FROM chats WHERE (user1_telegram_id = ? OR user2_telegram_id = ?) AND ended_at IS NULL AND is_active = TRUE',
      [telegramId.toString(), telegramId.toString()]
    );
    return res[0];
  } catch (err) {
    logger.error(err, `Error in getActiveChatByTelegramId (${telegramId})`);
    return undefined;
  }
}

async function getLastChatByTelegramId(telegramId, tx = null) {
  try {
    const queryFn = tx ? tx.query : query;
    const res = await queryFn(
      'SELECT * FROM chats WHERE (user1_telegram_id = ? OR user2_telegram_id = ?) ORDER BY started_at DESC LIMIT 1',
      [telegramId.toString(), telegramId.toString()]
    );
    return res[0];
  } catch (err) {
    logger.error(err, `Error in getLastChatByTelegramId (${telegramId})`);
    return undefined;
  }
}

async function endChat(chatId, tx = null) {
  try {
    const queryFn = tx ? tx.query : query;
    const info = await queryFn('UPDATE chats SET ended_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE id = ?', [chatId]);
    
    if (info.affectedRows > 0) {
      const res = await queryFn('SELECT * FROM chats WHERE id = ?', [chatId]);
      return res[0];
    }
    return undefined;
  } catch (err) {
    logger.error(err, `Error in endChat (${chatId})`);
    return undefined;
  }
}

async function saveMessage(chatId, senderTelegramId, content, mediaType = null, mediaFileId = null, tx = null) {
  try {
    const queryFn = tx ? tx.query : query;
    await queryFn('INSERT INTO messages (chat_id, sender_telegram_id, content, media_type, media_file_id) VALUES (?, ?, ?, ?, ?)', 
                  [chatId, senderTelegramId, content, mediaType, mediaFileId]);
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
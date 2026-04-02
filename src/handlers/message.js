/**
 * Message Handler — global message forwarding logic.
 */
const { t } = require('../locales');
const { db } = require('../database');
const logger = require('../utils/logger');
const { getUserByTelegramId, getUserById, updateUserState } = require('../services/userService');
const { getActiveChatByUserId, saveMessage, endChat } = require('../services/chatService');

function registerMessageHandler(bot, findMatchForUser) {
  bot.on('message', async (ctx, next) => {
    if (ctx.scene && ctx.scene.current) return next();
    if (ctx.session && ctx.session.processing) return next();
    try {
      if (!ctx.message) return next();
      const tid = ctx.from.id;
      const user = await getUserByTelegramId(tid);
      if (!user) return;
      const lang = user.language || 'English';
      if (ctx.message.text && ctx.message.text.startsWith('/')) return next();
      const activeChat = await getActiveChatByUserId(user.id);
      if (!activeChat) {
        if (ctx.message.text) return ctx.reply(t('not_in_chat', lang));
        return;
      }
      const partnerId = activeChat.user1_id === user.id ? activeChat.user2_id : activeChat.user1_id;
      const partner = await getUserById(partnerId);
      let type = null, fid = null;
      const msg = ctx.message;
      if (msg.photo) { type = 'photo'; fid = msg.photo[msg.photo.length - 1].file_id; }
      else if (msg.video) { type = 'video'; fid = msg.video.file_id; }
      else if (msg.animation) { type = 'animation'; fid = msg.animation.file_id; }
      else if (msg.document) { type = 'document'; fid = msg.document.file_id; }
      else if (msg.voice) { type = 'voice'; fid = msg.voice.file_id; }
      else if (msg.audio) { type = 'audio'; fid = msg.audio.file_id; }
      else if (msg.sticker) { type = 'sticker'; fid = msg.sticker.file_id; }
      else if (msg.video_note) { type = 'video_note'; fid = msg.video_note.file_id; }
      else if (msg.location) { type = 'location'; }
      else if (msg.contact) { type = 'contact'; }
      
      await saveMessage(activeChat.id, tid, msg.text || msg.caption || null, type || 'text', fid);
      if (partner && partner.telegram_id) {
        try {
          const action = (type === 'photo' || type === 'video') ? 'upload_photo' : 'typing';
          await ctx.telegram.sendChatAction(partner.telegram_id, action);
          await ctx.telegram.copyMessage(partner.telegram_id, ctx.chat.id, ctx.message.message_id);
        } catch (err) {
          // FIX Bug #5: Only end the chat if the partner actually blocked the bot (403 error).
          // Transient errors (rate limiting, network) should NOT end the chat.
          if (err.response && err.response.error_code === 403) {
            // Partner blocked the bot — end the chat
            // Re-fetch partner to get their current state before deciding what to do
            const freshPartner = await getUserById(partnerId);
            await db.transaction(async (tx) => {
              await tx.query('UPDATE chats SET ended_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE id = $1', [activeChat.id]);
              // Only re-queue partner if they were actively chatting (not idle)
              const partnerState = (freshPartner && freshPartner.state === 'chatting') ? 'waiting' : (freshPartner ? freshPartner.state : 'waiting');
              await tx.query('UPDATE users SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2', [partnerState, partner.telegram_id.toString()]);
              await tx.query('UPDATE users SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2', ['waiting', tid.toString()]);
            });
            await ctx.reply(t('partner_not_found', lang));
            findMatchForUser(tid, lang).catch(e => logger.error(e));
            if (freshPartner && freshPartner.state === 'chatting') {
              findMatchForUser(partner.telegram_id, partner.language || 'English').catch(e => logger.error(e));
            }
          } else {
            // Transient error — log it but don't end the chat
            logger.error(err, 'Message forwarding error (non-fatal)');
            await ctx.reply(t('message_delivery_failed', lang));
          }
        }
      } else {
            // Transient error — log it but don't end the chat
            logger.error(err, 'Message forwarding error (non-fatal)');
            await ctx.reply(t('message_delivery_failed', lang));
          }
        }
      } else {
        await endChat(activeChat.id);
        await updateUserState(tid, 'waiting');
        await ctx.reply(t('partner_not_found', lang));
        findMatchForUser(tid, lang).catch(e => logger.error(e));
      }
    } catch (err) {
      logger.error(err, 'Handler error global message');
    }
  });
}

module.exports = { registerMessageHandler };

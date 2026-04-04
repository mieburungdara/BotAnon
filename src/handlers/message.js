/**
 * Message Handler — global message forwarding logic.
 */
const { t } = require('../locales');
const { db } = require('../database');
const logger = require('../utils/logger');
const { getUserByTelegramId, updateUserState } = require('../services/userService');
const { getActiveChatByTelegramId, getPartnerTelegramId, saveMessage, endChat } = require('../services/chatService');

function registerMessageHandler(bot, findMatchForUser) {
  bot.on('message', async (ctx, next) => {
    // Jika pesan adalah command, biarkan command handler yang menangani
    if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/')) return next();
    
    // User di scene (misal: /report) harus TETAP bisa menerima pesan dari partner.
    const isUserInScene = !!(ctx.scene && ctx.scene.current);
    
    if (ctx.session && ctx.session.processing) return next();
    
    try {
      if (!ctx.message) return next();
      const tid = ctx.from.id;
      
      const user = await getUserByTelegramId(tid);
      if (!user) return;
      const lang = user.language || 'English';
      
      const activeChat = await getActiveChatByTelegramId(tid);

      // ✅ FIX Bug #110: Message from USER inside a scene
      // Block forwarding out of the scene to protect PII/input integrity
      if (isUserInScene) {
          return next();
      }

      if (!activeChat) {
          // ✅ SELF-HEALING: Detect and fix ghost chatting state
          if (user.state === 'chatting') {
              logger.warn({ telegramId: tid.toString() }, 'Desync detected: User in chatting state but no active chat. Self-healing to idle.');
              await updateUserState(tid, 'idle');
              
              // Inform the user and guide them
              await ctx.reply(t('something_went_wrong', lang)).catch(() => {});
              await ctx.reply(t('chat_ended', lang)).catch(() => {});
              return;
          } else if (user.state === 'waiting') {
              // ✅ NEW: Provide specific feedback for users in queue
              if (ctx.message.text) await ctx.reply(t('still_waiting', lang)).catch(() => {});
              return;
          }
          
          // Hanya balas jika itu pesan teks (bukan media yang tidak jelas)
          if (ctx.message.text) await ctx.reply(t('not_in_chat', lang)).catch(() => {});
          return;
      }

      const partnerTid = getPartnerTelegramId(activeChat, tid);
      if (!partnerTid) {
          await endChat(activeChat.id);
          await updateUserState(tid, 'waiting');
          await ctx.reply(t('partner_not_found', lang)).catch(() => {});
          findMatchForUser(tid, lang).catch(e => logger.error(e));
          return;
      }

      // Detect media type
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

      // Save to history atomic
      await saveMessage(activeChat.id, tid, msg.text || msg.caption || null, type || 'text', fid);

      try {
        const action = (type === 'photo' || type === 'video') ? 'upload_photo' : 'typing';
        await ctx.telegram.sendChatAction(partnerTid, action).catch(() => {});
        
        // ✅ FIX Bug #109: Preserve message sequence by awaiting copyMessage strictly
        await ctx.telegram.copyMessage(partnerTid, ctx.chat.id, ctx.message.message_id);
      } catch (err) {
        // Only end the chat if the partner actually blocked the bot (403 error).
        if (err.response && err.response.error_code === 403) {
          const { freshPartner } = await db.transaction(async (tx) => {
              const chatCheck = await tx.query('UPDATE chats SET ended_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE id = $1 AND is_active = TRUE RETURNING *', [activeChat.id]);
              if (chatCheck.rows.length === 0) return { freshPartner: null };

              const pRes = await tx.query('SELECT state, language FROM users WHERE telegram_id = $1', [partnerTid.toString()]);
              const fp = pRes.rows[0];
              
              await updateUserState(partnerTid, 'idle', tx);
              await updateUserState(tid, 'waiting', tx);
              
              return { freshPartner: fp };
          });

          if (freshPartner) {
            await ctx.reply(t('partner_disconnected', lang)).catch(() => {});
            findMatchForUser(tid, lang).catch(e => logger.error(e));
          }
        } else if (err.response && err.response.error_code === 429) {
          logger.warn(err, 'Message forwarding rate limited');
        } else {
          logger.error(err, 'Message forwarding error (non-fatal)');
          await ctx.reply(t('message_delivery_failed', lang)).catch(() => {});
        }
      }
    } catch (err) {
      logger.error(err, 'Handler error global message');
    }
  });
}

module.exports = { registerMessageHandler };

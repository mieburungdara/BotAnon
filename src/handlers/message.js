/**
 * Message Handler — global message forwarding logic.
 */
const { t } = require('../locales');
const { db } = require('../database');
const logger = require('../utils/logger');
const { getUserByTelegramId, updateUserState } = require('../services/userService');
const { getActiveChatByTelegramId, getPartnerTelegramId, saveMessage, endChat } = require('../services/chatService');
const { transitionOnBlock } = require('../services/stateMachine');

function registerMessageHandler(bot, findMatchForUser) {
  bot.on('message', async (ctx, next) => {
    // ✅ FIX Bug L4: Check scene state IMMEDIATELY to avoid redundant DB calls for input in scenes
    const isUserInScene = !!(ctx.scene && ctx.scene.current);
    if (isUserInScene) {
      // If it's a command, let commandWrapper handle it via next()
      if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/')) return next();
      return next(); 
    }

    // Jika pesan adalah command, biarkan command handler yang menangani
    if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/')) return next();
    
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
               await ctx.reply(t('something_went_wrong', lang)).catch((err) => logger.error(err, 'Failed to send error message'));
               await ctx.reply(t('chat_ended', lang)).catch((err) => logger.error(err, 'Failed to send chat ended message'));
              return;
          } else if (user.state === 'waiting') {
              // ✅ NEW: Provide specific feedback for users in queue
              if (ctx.message.text) await ctx.reply(t('still_waiting', lang)).catch((err) => logger.error(err, 'Failed to send still waiting message'));
              return;
          }
          
          // Hanya balas jika itu pesan teks (bukan media yang tidak jelas)
           if (ctx.message.text) await ctx.reply(t('not_in_chat', lang)).catch((err) => logger.error(err, 'Failed to send not in chat message'));
          return;
      }

      const partnerTid = getPartnerTelegramId(activeChat, tid);
      if (!partnerTid) {
          await endChat(activeChat.id);
          await updateUserState(tid, 'waiting');
           await ctx.reply(t('partner_not_found', lang)).catch((err) => logger.error(err, 'Failed to send partner not found message'));
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
         await ctx.telegram.sendChatAction(partnerTid, action).catch((err) => logger.error(err, 'Failed to send chat action'));
        
        // ✅ FIX Bug #109: Preserve message sequence by awaiting copyMessage strictly
        await ctx.telegram.copyMessage(partnerTid, ctx.chat.id, ctx.message.message_id, {
          protect_content: true
        });
      } catch (err) {
        // Only end the chat if the partner actually blocked the bot (403 error).
        if (err.response && err.response.error_code === 403) {
          const { chat } = await transitionOnBlock(tid, partnerTid);
          
          if (chat) {
            await ctx.reply(t('partner_disconnected', lang)).catch((err) => logger.error(err, 'Failed to send partner disconnected message'));
            findMatchForUser(tid, lang).catch(e => logger.error(e));
          }
        } else if (err.response && err.response.error_code === 429) {
          logger.warn(err, 'Message forwarding rate limited');
        } else {
          logger.error(err, 'Message forwarding error (non-fatal)');
           await ctx.reply(t('message_delivery_failed', lang)).catch((err) => logger.error(err, 'Failed to send message delivery failed notification'));
        }
      }
    } catch (err) {
      logger.error(err, 'Handler error global message');
    }
  });
}

module.exports = { registerMessageHandler };

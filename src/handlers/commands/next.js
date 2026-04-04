/**
 * Next Command Handler — /next command logic.
 */
const { t } = require('../../locales');
const { db } = require('../../database');
const logger = require('../../utils/logger');
const { getUserByTelegramId, getUserById, updateUserState } = require('../../services/userService');
const { getActiveChatByTelegramId, getPartnerTelegramId } = require('../../services/chatService');


const { createCommandHandler } = require('../../middleware/commandWrapper');

function registerNextCommand(bot, findMatchForUser, sendRatingPrompt) {
  bot.command('next', createCommandHandler(async (ctx, user, tid, lang) => {
    const activeChat = await getActiveChatByTelegramId(tid);
    if (activeChat) {
      let partnerTelegramId = null;
      let partnerLang = 'English';
      let partnerDbId = null;
      
      try {
         const partnerTid = getPartnerTelegramId(activeChat, tid);
         const p = await getUserByTelegramId(partnerTid);
         if (p) {
           partnerLang = p.language || 'English';
           partnerTelegramId = partnerTid;
           partnerDbId = p.id;
         }
         
          await db.transaction(async (tx) => {
            const chatCheck = await tx.query('UPDATE chats SET ended_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE id = $1 AND is_active = TRUE RETURNING *', [activeChat.id]);
            if (chatCheck.rows.length === 0) return;

            await updateUserState(tid, 'waiting', tx);
            if (p) {
              await updateUserState(partnerTid, 'idle', tx);
            }
          });
      } catch (txErr) {
        logger.error(txErr, 'Chat end transaction failed');
        throw txErr;
      }

      if (partnerTelegramId) {
        try { await ctx.telegram.sendMessage(partnerTelegramId, t('chat_ended', partnerLang)); } catch (pErr) {}
        
        // No more automatic re-match for the abandoned partner
        await sendRatingPrompt(partnerTelegramId, user.id, partnerLang);
        
        await sendRatingPrompt(tid, partnerDbId, lang);
      }
    } else {
      if (user.state === 'waiting') {
        await ctx.reply(t('now_waiting', lang));
        await findMatchForUser(tid, lang).catch(e => logger.error(e));
        return;
      }
      await updateUserState(tid, 'waiting');
    }
    await ctx.reply(t('waiting_new_partner', lang));
    await findMatchForUser(tid, lang);
  }));
}

module.exports = { registerNextCommand };

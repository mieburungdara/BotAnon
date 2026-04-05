/**
 * Next Command Handler — /next command logic.
 */
const { t } = require('../../locales');
const logger = require('../../utils/logger');
const { getUserByTelegramId, updateUserState } = require('../../services/userService');
const { getActiveChatByTelegramId } = require('../../services/chatService');
const { transitionToWaiting } = require('../../services/stateMachine');
const { createCommandHandler } = require('../../middleware/commandWrapper');

function registerNextCommand(bot, findMatchForUser, sendRatingPrompt) {
  bot.command('next', createCommandHandler(async (ctx, user, tid, lang) => {
    const activeChat = await getActiveChatByTelegramId(tid);
    if (activeChat) {
      let partnerTelegramId = null;
      let partnerLang = 'English';
      
      try {
         const { partnerTid } = await transitionToWaiting(tid);
         if (partnerTid) {
           const p = await getUserByTelegramId(partnerTid);
           if (p) {
             partnerLang = p.language || 'English';
             partnerTelegramId = partnerTid;
           }
         }
      } catch (txErr) {
        logger.error(txErr, 'Chat end transaction failed');
        throw txErr;
      }

      if (partnerTelegramId) {
        try { await ctx.telegram.sendMessage(partnerTelegramId, t('chat_ended', partnerLang)); } catch (pErr) {}
        
        // No more automatic re-match for the abandoned partner
        await sendRatingPrompt(partnerTelegramId, tid, partnerLang);
        
        await sendRatingPrompt(tid, partnerTelegramId, lang);
      }
    } else {
      if (user.state === 'waiting') {
        await ctx.reply(t('now_waiting', lang));
        await findMatchForUser(tid, lang).catch(e => logger.error(e));
        return;
      }
      // Automatch state transition handled inside matchmaking
    }
    await ctx.reply(t('waiting_new_partner', lang));
    await findMatchForUser(tid, lang);
  }));
}

module.exports = { registerNextCommand };

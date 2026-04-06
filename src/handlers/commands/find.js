/**
 * Find Command Handler — /find command logic.
 */
const { t } = require('../../locales');
const logger = require('../../utils/logger');
const { getUserByTelegramId, updateUserState } = require('../../services/userService');
const { getActiveChatByTelegramId } = require('../../services/chatService');
const { transitionToWaiting } = require('../../services/stateMachine');
const { createCommandHandler } = require('../../middleware/commandWrapper');

function registerFindCommand(bot, findMatchForUser, sendRatingPrompt) {
  const handler = createCommandHandler(async (ctx, user, tid, lang) => {
    const activeChat = await getActiveChatByTelegramId(tid);
    
    if (activeChat) {
      // 🔄 CASE: SWITCH PARTNER (Like /next)
      let partnerTid = null;
      let partnerLang = 'English';

      try {
        const result = await transitionToWaiting(tid);
        partnerTid = result.partnerTid;
        if (partnerTid) {
           const p = await getUserByTelegramId(partnerTid);
           if (p) {
             partnerLang = p.language || 'English';
           }
           
           // Notify partner clearly that their partner left to find someone else
            await ctx.telegram.sendMessage(partnerTid, t('partner_ended_chat', partnerLang)).catch((err) => logger.error(err, 'Failed to send partner ended chat message'));
           await sendRatingPrompt(partnerTid, tid, partnerLang);
           await sendRatingPrompt(tid, partnerTid, lang);
        }
      } catch (err) {
        logger.error(err, 'Switch partner failed in /find');
      }
    } else {
      // Logic for moving state to 'waiting' moved INTO findMatchForUser transaction for M3
    }

    // Trigger matchmaking and WAIT for result
    const wasMatched = await findMatchForUser(tid, lang).catch(e => {
      logger.error(e);
      return false;
    });

    // Final feedback after match attempt
    if (!wasMatched) {
      if (activeChat) {
         await ctx.reply(t('waiting_new_partner', lang));
      } else if (user.state !== 'waiting') {
         await ctx.reply(t('now_waiting', lang));
      } else {
         await ctx.reply(t('already_searching', lang));
      }
    }
  });

  bot.command('find', handler);
  bot.command('next', handler);
  
  return handler;
}

module.exports = { registerFindCommand };

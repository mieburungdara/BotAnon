/**
 * Stop Command Handler — /stop command logic.
 */
const { t } = require('../../locales');
const logger = require('../../utils/logger');
const { getUserByTelegramId, updateUserState } = require('../../services/userService');
const { getActiveChatByTelegramId } = require('../../services/chatService');
const { transitionToIdle } = require('../../services/stateMachine');
const { createCommandHandler } = require('../../middleware/commandWrapper');

function registerStopCommand(bot, sendRatingPrompt, findMatchForUser) {
  bot.command('stop', createCommandHandler(async (ctx, user, tid, lang) => {
    const activeChat = await getActiveChatByTelegramId(tid);

    if (activeChat) {
      let partnerTelegramId = null;
      let partnerLang = 'English';

      const { partnerTid } = await transitionToIdle(tid);
      if (partnerTid) {
         const p = await getUserByTelegramId(partnerTid);
         if (p) {
           partnerLang = p.language || 'English';
           partnerTelegramId = partnerTid;
         }
      }

      if (partnerTelegramId) {
        try { await ctx.telegram.sendMessage(partnerTelegramId, t('partner_ended_chat', partnerLang)); } catch (pErr) {}
        
        // Notify both about rating
        await sendRatingPrompt(partnerTelegramId, tid, partnerLang);
        await sendRatingPrompt(tid, partnerTelegramId, lang);
      }

      return ctx.reply(t('chat_ended', lang));
    }

    if (user.state === 'waiting') {
      await updateUserState(tid, 'idle');
      return ctx.reply(t('stopped_searching', lang));
    }

    return ctx.reply(t('not_searching', lang));
  }));
}

module.exports = { registerStopCommand };

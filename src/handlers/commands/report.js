/**
 * Report Command Handler — /report command logic.
 */
const { t } = require('../../locales');
const logger = require('../../utils/logger');
const { getUserByTelegramId } = require('../../services/userService');
const { getActiveChatByUserId, getLastPartnerByUserId } = require('../../services/chatService');
const { extractEvidenceFromReply } = require('../../services/reportService');

function registerReportCommand(bot) {
  bot.command('report', async (ctx) => {
    if (ctx.session) {
      if (ctx.session.processing) return;
      ctx.session.processing = true;
      ctx.session.setting = null;
      ctx.session.attachedEvidence = null;
      ctx.session.reportDetails = null;
      ctx.session.reportedId = null;
      ctx.session.reportReason = null;
    }
    try {
      const user = await getUserByTelegramId(ctx.from.id);
      if (!user) { if (ctx.session) ctx.session.processing = false; return ctx.reply(t('start_to_register', 'English')); }
      const lastChat = await getLastPartnerByUserId(user.id);
      if (!lastChat) { if (ctx.session) ctx.session.processing = false; return ctx.reply(t('no_partner_to_report', user.language || 'English')); }
      const pId = lastChat.user1_id === user.id ? lastChat.user2_id : lastChat.user1_id;
      let ev = '';
      if (ctx.message && ctx.message.reply_to_message) {
        ev = extractEvidenceFromReply(ctx.message.reply_to_message);
      }
      ctx.session.userId = user.id;
      ctx.session.reportedId = pId;
      ctx.session.attachedEvidence = ev;
      const activeChat = await getActiveChatByUserId(user.id);
      ctx.session.reportChatId = (activeChat && activeChat.id === lastChat.id) ? activeChat.id : null;
      await ctx.scene.enter('reportFlow');
    } catch (err) {
      logger.error(err, 'Handler error /report');
    }
    if (ctx.session) ctx.session.processing = false;
  });
}

module.exports = { registerReportCommand };

/**
 * Report Command Handler — /report command logic.
 */
const { db } = require('../../database');
const { t } = require('../../locales');
const logger = require('../../utils/logger');
const { getUserByTelegramId } = require('../../services/userService');
const { getActiveChatByTelegramId, getLastChatByTelegramId, getPartnerTelegramId } = require('../../services/chatService');

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
      if (!user) { return ctx.reply(t('start_to_register', 'English')); }
      const lastChat = await getLastChatByTelegramId(ctx.from.id);
      if (!lastChat) { return ctx.reply(t('no_partner_to_report', user.language || 'English')); }
      const partnerTid = getPartnerTelegramId(lastChat, ctx.from.id);
      let pId = null;
      
      try {
        const partner = await getUserByTelegramId(partnerTid);
        pId = partner ? partner.id : null;
      } catch (e) {
        // Partner mungkin sudah dihapus, coba cari dari chat history
        const historyCheck = await db.query('SELECT sender_telegram_id FROM messages WHERE chat_id = $1 AND sender_telegram_id != $2 LIMIT 1', [lastChat.id, ctx.from.id.toString()]);
        if (historyCheck.rows.length > 0) {
          const oldPartner = await getUserByTelegramId(historyCheck.rows[0].sender_telegram_id);
          pId = oldPartner ? oldPartner.id : null;
        }
      }
      
      if (!pId) { return ctx.reply(t('no_partner_to_report', user.language || 'English')); }
      let ev = '';
      if (ctx.message && ctx.message.reply_to_message) {
        ev = extractEvidenceFromReply(ctx.message.reply_to_message);
      }
      ctx.session.userId = user.id;
      ctx.session.reportedId = pId;
      ctx.session.attachedEvidence = ev;
      const activeChat = await getActiveChatByTelegramId(ctx.from.id);
      ctx.session.reportChatId = (activeChat && activeChat.id === lastChat.id) ? activeChat.id : null;
      await ctx.scene.enter('reportFlow');
    } catch (err) {
      logger.error(err, 'Handler error /report');
    } finally {
      if (ctx.session) ctx.session.processing = false;
    }
  });
}

module.exports = { registerReportCommand };

/**
 * Report Command Handler — /report command logic.
 */
const { db } = require('../../database');
const { t } = require('../../locales');
const logger = require('../../utils/logger');
const { getUserByTelegramId } = require('../../services/userService');
const { getActiveChatByTelegramId, getLastChatByTelegramId, getPartnerTelegramId } = require('../../services/chatService');

const { extractEvidenceFromReply } = require('../../services/reportService');
const { createCommandHandler } = require('../../middleware/commandWrapper');

function registerReportCommand(bot) {
  bot.command('report', createCommandHandler(async (ctx, user, tid, lang) => {
    const lastChat = await getLastChatByTelegramId(tid);
    if (!lastChat) { return ctx.reply(t('no_partner_to_report', lang)); }
    
    const partnerTid = getPartnerTelegramId(lastChat, tid);
    let pId = null;
    
    try {
      const partner = await getUserByTelegramId(partnerTid);
      pId = partner ? partner.id : null;
    } catch (e) {
      const historyCheck = await db.query('SELECT sender_telegram_id FROM messages WHERE chat_id = $1 AND sender_telegram_id != $2 LIMIT 1', [lastChat.id, tid.toString()]);
      if (historyCheck.rows.length > 0) {
        const oldPartner = await getUserByTelegramId(historyCheck.rows[0].sender_telegram_id);
        pId = oldPartner ? oldPartner.id : null;
      }
    }
    
    if (!pId) { return ctx.reply(t('no_partner_to_report', lang)); }
    
    let ev = '';
    if (ctx.message && ctx.message.reply_to_message) {
      ev = extractEvidenceFromReply(ctx.message.reply_to_message);
    }
    
    ctx.session.userId = user.id;
    ctx.session.reportedId = pId;
    ctx.session.attachedEvidence = ev;
    
    // ✅ FIX Bug M2: Find current active chat to potentially close it on report
    const activeChat = await getActiveChatByTelegramId(tid);
    // Only link if the active chat matches the last interaction (or is the current one)
    ctx.session.reportChatId = (activeChat && (activeChat.id === lastChat.id || activeChat.user1_telegram_id == partnerTid || activeChat.user2_telegram_id == partnerTid)) ? activeChat.id : null;
    
    await ctx.scene.enter('reportFlow');
  }));
}

module.exports = { registerReportCommand };

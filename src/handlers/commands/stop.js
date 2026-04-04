/**
 * Stop Command Handler — /stop command logic.
 */
const { t } = require('../../locales');
const { db } = require('../../database');
const logger = require('../../utils/logger');
const { getUserById, getUserByTelegramId, updateUserState } = require('../../services/userService');
const { getActiveChatByTelegramId, getPartnerTelegramId } = require('../../services/chatService');

const { createCommandHandler } = require('../../middleware/commandWrapper');

function registerStopCommand(bot, sendRatingPrompt, findMatchForUser) {
  bot.command('stop', createCommandHandler(async (ctx, user, tid, lang) => {
    const activeChat = await getActiveChatByTelegramId(tid);

    if (activeChat) {
      let partnerTelegramId = null;
      let partnerLang = 'English';
      let partnerDbId = null;

      await db.transaction(async (tx) => {
        // ✅ ATOMIC CHECK: Pastikan chat masih aktif sebelum ditutup
        const chatCheck = await tx.query('UPDATE chats SET ended_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE id = $1 AND is_active = TRUE RETURNING *', [activeChat.id]);
        if (chatCheck.rows.length === 0) return; // Sudah ditutup orang lain

        await updateUserState(tid, 'idle', tx);
        const partnerTid = getPartnerTelegramId(activeChat, tid);
        const pRes = await tx.query('SELECT id, language FROM users WHERE telegram_id = $1', [partnerTid]);
        const p = pRes.rows[0];
          if (p) {
            partnerLang = p.language || 'English';
            partnerTelegramId = partnerTid;
            partnerDbId = p.id;
            
            // ✅ FIX PER RULE #4: Partner should STOP (idle), not auto-requeue
            await updateUserState(partnerTid, 'idle', tx);
          }
      });

      if (partnerTelegramId) {
        try { await ctx.telegram.sendMessage(partnerTelegramId, t('partner_ended_chat', partnerLang)); } catch (pErr) {}
        
        // Notify both about rating
        await sendRatingPrompt(partnerTelegramId, user.id, partnerLang);
        await sendRatingPrompt(tid, partnerDbId, lang);
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

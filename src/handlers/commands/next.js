/**
 * Next Command Handler — /next command logic.
 */
const { t } = require('../../locales');
const { db } = require('../../database');
const logger = require('../../utils/logger');
const { getUserByTelegramId, getUserById, updateUserState } = require('../../services/userService');
const { getActiveChatByUserId } = require('../../services/chatService');

function registerNextCommand(bot, findMatchForUser, sendRatingPrompt) {
  bot.command('next', async (ctx) => {
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
      const tid = ctx.from.id;
      const user = await getUserByTelegramId(tid);
      if (!user) {
        return ctx.reply(t('start_to_register', 'English'));
      }
      const lang = user.language || 'English';
      const activeChat = await getActiveChatByUserId(user.id);
      if (activeChat) {
        let partnerTelegramId = null;
        let partnerLang = 'English';
        let partnerDbId = null;
        // FIX Bug #7: Move Telegram I/O outside the database transaction
        await db.transaction(async (tx) => {
          await tx.query('UPDATE chats SET ended_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE id = $1', [activeChat.id]);
          await tx.query('UPDATE users SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2', ['waiting', tid]);
          const pId = activeChat.user1_id === user.id ? activeChat.user2_id : activeChat.user1_id;
          const p = await getUserById(pId);
          if (p) {
            partnerLang = p.language || 'English';
            partnerTelegramId = p.telegram_id;
            partnerDbId = p.id;
            await tx.query('UPDATE users SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2', ['waiting', p.telegram_id]);
          }
        });
        if (partnerTelegramId) {
          try { await ctx.telegram.sendMessage(partnerTelegramId, t('partner_ended_chat', partnerLang)); } catch (pErr) {}
          // FIX Bug #34: Re-fetch partner to check if they've already been matched with someone else
          const freshPartner = await getUserById(partnerDbId);
          if (freshPartner && freshPartner.state === 'waiting') {
            await sendRatingPrompt(partnerTelegramId, user.id, partnerLang);
            findMatchForUser(partnerTelegramId, partnerLang).catch(e => logger.error(e));
          }
          // FIX Bug #86: Only send rating prompt to initiator if partner was found
          await sendRatingPrompt(tid, partnerDbId, lang);
        }
      } else {
        if (user.state === 'waiting') {
          await ctx.reply(t('now_waiting', lang));
          // ✅ Bersihkan antrian lama sebelum mulai pencarian baru
          await db.query('DELETE FROM matchmaking_queue WHERE user_id = $1', [user.id]);
          return await findMatchForUser(tid, lang);
        }
        await updateUserState(tid, 'waiting');
      }
      await ctx.reply(t('waiting_new_partner', lang));
      await findMatchForUser(tid, lang);
    } catch (err) {
      logger.error(err, 'Handler error /next');
    } finally {
      if (ctx.session) ctx.session.processing = false;
    }
  });
}

module.exports = { registerNextCommand };

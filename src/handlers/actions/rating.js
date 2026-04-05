/**
 * Rating Action Handler — rate partner callback actions.
 */
const { t } = require('../../locales');
const { db } = require('../../database');
const logger = require('../../utils/logger');
const { getUserByTelegramId } = require('../../services/userService');

function registerRatingAction(bot) {
  bot.action(/^rate_(\d+)_(pos|neg)$/, async (ctx) => {
    if (!ctx.session || ctx.session.processing) { try { await ctx.answerCbQuery(); } catch(e) {} return; }
    ctx.session.processing = true;
    try {
      await ctx.answerCbQuery();
    } catch (e) { ctx.session.processing = false; return; }
    try {
      const ratedTelegramIdStr = ctx.match[1];
      const score = ctx.match[2] === 'pos' ? 1 : -1;
      const user = await getUserByTelegramId(ctx.from.id);
      if (!user) { ctx.session.processing = false; return; }
      const lang = user.language || 'English';

      if (ctx.from.id.toString() === ratedTelegramIdStr) {
        ctx.session.processing = false;
        return ctx.editMessageText('⚠️ ' + t('cannot_rate_self', lang));
      }

       const chatQuery = 'SELECT id, started_at FROM chats WHERE ((user1_telegram_id = $1 AND user2_telegram_id = $2) OR (user1_telegram_id = $2 AND user2_telegram_id = $1)) ORDER BY started_at DESC LIMIT 1';
       const chatCheck = await db.query(chatQuery, [ctx.from.id.toString(), ratedTelegramIdStr]);
       
      if (chatCheck.rows.length === 0) {
        ctx.session.processing = false;
        return ctx.editMessageText('⚠️ ' + t('unauthorized_rating', lang));
      }

      // ✅ FIX Bug M4: Rating time limit (24 hours)
      const lastChatTime = new Date(chatCheck.rows[0].started_at).getTime();
      if (Date.now() - lastChatTime > 24 * 60 * 60 * 1000) {
        ctx.session.processing = false;
        return ctx.editMessageText('⚠️ ' + (t('rating_expired', lang) || 'Rating period (24h) has expired.'));
      }

      try {
        await db.transaction(async (tx) => {
          const ex = await tx.query('SELECT id FROM reputations WHERE rater_telegram_id = $1 AND rated_telegram_id = $2', [ctx.from.id.toString(), ratedTelegramIdStr]);
          if (ex.rows.length > 0) await tx.query('UPDATE reputations SET score = $1 WHERE rater_telegram_id = $2 AND rated_telegram_id = $3', [score, ctx.from.id.toString(), ratedTelegramIdStr]);
          else await tx.query('INSERT INTO reputations (rater_telegram_id, rated_telegram_id, score) VALUES ($1, $2, $3)', [ctx.from.id.toString(), ratedTelegramIdStr, score]);
        });
      } catch (txErr) {
        logger.error(txErr, 'Rating transaction failed');
        throw txErr;
      }
      await ctx.editMessageText(t('rate_recorded', lang));
    } catch (err) {
      logger.error(err, 'Rating error');
    } finally {
      ctx.session.processing = false;
    }
  });
}

module.exports = { registerRatingAction };

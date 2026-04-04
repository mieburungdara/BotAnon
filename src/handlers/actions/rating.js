/**
 * Rating Action Handler — rate partner callback actions.
 */
const { t } = require('../../locales');
const { db } = require('../../database');
const logger = require('../../utils/logger');
const { getUserByTelegramId, getUserById } = require('../../services/userService');

function registerRatingAction(bot) {
  bot.action(/^rate_(\d+)_(pos|neg)$/, async (ctx) => {
    if (!ctx.session || ctx.session.processing) { try { await ctx.answerCbQuery(); } catch(e) {} return; }
    ctx.session.processing = true;
    try {
      await ctx.answerCbQuery();
    } catch (e) { ctx.session.processing = false; return; }
    try {
      const ratedId = parseInt(ctx.match[1], 10);
      const score = ctx.match[2] === 'pos' ? 1 : -1;
      const user = await getUserByTelegramId(ctx.from.id);
      if (!user) { ctx.session.processing = false; return; }
      const lang = user.language || 'English';

      if (user.id === ratedId) {
        ctx.session.processing = false;
        return ctx.editMessageText('⚠️ ' + t('cannot_rate_self', lang));
      }

       // Backward compatible: masih support user id lama untuk rating yang sudah ada
       const ratedUser = await getUserById(ratedId);
       const chatCheck = await db.query('SELECT id FROM chats WHERE (user1_telegram_id = $1 AND user2_telegram_id = $2) OR (user1_telegram_id = $2 AND user2_telegram_id = $1) LIMIT 1', [ctx.from.id.toString(), ratedUser?.telegram_id || '0']);
      if (chatCheck.rows.length === 0) {
        ctx.session.processing = false;
        return ctx.editMessageText('⚠️ ' + t('unauthorized_rating', lang));
      }

      try {
        await db.transaction(async (tx) => {
          const ex = await tx.query('SELECT id FROM reputations WHERE rater_id = $1 AND rated_id = $2', [user.id, ratedId]);
          if (ex.rows.length > 0) await tx.query('UPDATE reputations SET score = $1 WHERE rater_id = $2 AND rated_id = $3', [score, user.id, ratedId]);
          else await tx.query('INSERT INTO reputations (rater_id, rated_id, score) VALUES ($1, $2, $3)', [user.id, ratedId, score]);
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

/**
 * Rating Action Handler — rate partner callback actions.
 */
const { t } = require('../../locales');
const { db } = require('../../database');
const logger = require('../../utils/logger');
const { getUserByTelegramId } = require('../../services/userService');

function registerRatingAction(bot) {
  bot.action(/^rate_(\d+)_(pos|neg)$/, async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
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
        return ctx.answerCbQuery(t('cannot_rate_self', lang), { show_alert: true });
      }

      const chatCheck = await db.query('SELECT id FROM chats WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1) LIMIT 1', [user.id, ratedId]);
      if (chatCheck.rows.length === 0) {
        ctx.session.processing = false;
        return ctx.answerCbQuery(t('unauthorized_rating', lang), { show_alert: true });
      }

      await db.transaction(async (tx) => {
        const ex = await tx.query('SELECT id FROM reputations WHERE rater_id = $1 AND rated_id = $2', [user.id, ratedId]);
        if (ex.rows.length > 0) await tx.query('UPDATE reputations SET score = $1 WHERE rater_id = $2 AND rated_id = $3', [score, user.id, ratedId]);
        else await tx.query('INSERT INTO reputations (rater_id, rated_id, score) VALUES ($1, $2, $3)', [user.id, ratedId, score]);
      });
      await ctx.editMessageText(t('rate_recorded', lang));
    } catch (err) {
      logger.error(err, 'Rating error');
    }
    ctx.session.processing = false;
  });
}

module.exports = { registerRatingAction };

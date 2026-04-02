/**
 * Start Command Handler — /start command logic.
 */
const { t } = require('../../locales');
const { getUserByTelegramId, createUser, syncUserIdentity, updateUserState } = require('../../services/userService');
const { getActiveChatByUserId } = require('../../services/chatService');
const logger = require('../../utils/logger');

function registerStartCommand(bot, findMatchForUser) {
  bot.command('start', async (ctx) => {
    if (ctx.session) {
      if (ctx.session.processing) return;
      ctx.session.processing = true;
      ctx.session.setting = null;
      ctx.session.attachedEvidence = null;
      ctx.session.reportedId = null;
      ctx.session.reportDetails = null;
      ctx.session.reportReason = null;
    }
    try {
      const tid = ctx.from.id;
      const user = await getUserByTelegramId(tid);
      if (!user) {
        const u = await createUser(tid, ctx.from.username, ctx.from.first_name, ctx.from.last_name);
        await ctx.reply(t('welcome_incomplete', 'English'));
        await ctx.scene.enter('profileSetup');
        if (ctx.session) ctx.session.processing = false;
        return;
      }
      await syncUserIdentity(tid, ctx.from.username, ctx.from.first_name, ctx.from.last_name);
      const lang = user.language || 'English';
      if (await getActiveChatByUserId(user.id)) {
        // FIX Bug #15: Use a more generic message since /start is not a settings command
        await ctx.reply(t('already_in_chat', lang) || t('cannot_open_settings_in_chat', lang));
        if (ctx.session) ctx.session.processing = false;
        return;
      }
      if (!user.age || !user.gender || !user.language || !user.zodiac) {
        await ctx.reply(t('profile_incomplete', lang));
        await ctx.scene.enter('profileSetup');
        if (ctx.session) ctx.session.processing = false;
        return;
      }
      await updateUserState(tid, 'waiting');
      await ctx.reply(t('now_waiting', lang));
      await findMatchForUser(tid, lang);
    } catch (err) {
      logger.error(err, 'Handler error /start');
    }
    if (ctx.session) ctx.session.processing = false;
  });
}

module.exports = { registerStartCommand };

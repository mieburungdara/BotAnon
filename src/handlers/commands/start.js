/**
 * Start Command Handler — /start command logic.
 */
const { t } = require('../../locales');
const { getUserByTelegramId, createUser, syncUserIdentity, updateUserState } = require('../../services/userService');
const { getActiveChatByUserId } = require('../../services/chatService');
const logger = require('../../utils/logger');

const { createCommandHandler } = require('../../middleware/commandWrapper');
const { getActiveChatByTelegramId } = require('../../services/chatService');

function registerStartCommand(bot, findMatchForUser) {
  bot.command('start', createCommandHandler(async (ctx, user, tid, lang) => {
    if (!user) {
      const u = await createUser(tid, ctx.from.username, ctx.from.first_name, ctx.from.last_name);
      if (!u) {
        logger.error({ tid }, 'Failed to create user record');
        return ctx.reply(t('something_went_wrong', 'English'));
      }
      await ctx.reply(t('welcome_incomplete', 'English'));
      await ctx.scene.enter('profileSetup');
      return;
    }

    await syncUserIdentity(tid, ctx.from.username, ctx.from.first_name, ctx.from.last_name);
    
    if (await getActiveChatByTelegramId(tid)) {
      await ctx.reply(t('already_in_chat', lang));
      return;
    }

    if (!user.age || !user.gender || !user.language || !user.zodiac) {
      await ctx.reply(t('profile_incomplete', lang));
      await ctx.scene.enter('profileSetup');
      return;
    }

    await updateUserState(tid, 'waiting');
    await ctx.reply(t('now_waiting', lang));
    try {
      await findMatchForUser(tid, lang);
    } catch (e) {
      logger.error(e);
    }
  }, true));
}

module.exports = { registerStartCommand };

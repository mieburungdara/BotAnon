/**
 * Settings Command Handler — /settings command logic.
 */
const { t } = require('../../locales');
const { getUserByTelegramId } = require('../../services/userService');
const { getActiveChatByUserId } = require('../../services/chatService');

function registerSettingsCommand(bot) {
  bot.command('settings', async (ctx) => {
    if (ctx.session) {
      if (ctx.session.processing) return;
      ctx.session.setting = null;
      ctx.session.attachedEvidence = null;
      ctx.session.reportedId = null;
      ctx.session.reportDetails = null;
      ctx.session.reportReason = null;
      ctx.session.processing = false;
    }
    try {
      const user = await getUserByTelegramId(ctx.from.id);
      if (!user) return ctx.reply(t('start_to_register', 'English'));
      const lang = user.language || 'English';
      if (await getActiveChatByUserId(user.id)) return ctx.reply(t('cannot_open_settings_in_chat', lang));
      const msg = await ctx.reply(t('settings_menu', lang), { reply_markup: { inline_keyboard: [[{ text: t('btn_age', lang), callback_data: 'setting_age' }], [{ text: t('btn_gender', lang), callback_data: 'setting_gender' }], [{ text: t('btn_zodiac', lang), callback_data: 'setting_zodiac' }], [{ text: t('btn_language', lang), callback_data: 'setting_language' }]] } });
      ctx.session.settingsMsgId = msg.message_id;
    } catch (err) {
      require('../../utils/logger').error(err, 'Handler error /settings');
    }
  });
}

module.exports = { registerSettingsCommand };

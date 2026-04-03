/**
 * Settings Age Scene — allows users to change their age.
 */
const { Scenes } = require('telegraf');
const { t } = require('../locales');
const { updateUserProfile } = require('../services/userService');

function createSettingsAgeScene() {
  const settingsAgeScene = new Scenes.BaseScene('settingsAgeScene');

  settingsAgeScene.enter(async (ctx) => {
    const lang = ctx.session.language || 'English';
    const msg = await ctx.reply(t('enter_new_age', lang), { reply_markup: { inline_keyboard: [[{ text: t('btn_cancel', lang), callback_data: 'cancel_setting' }]] } });
    ctx.session.settingsAgeMsgId = msg.message_id;
  });

  settingsAgeScene.action('cancel_setting', async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    try { await ctx.answerCbQuery(); } catch (e) { ctx.session.processing = false; return; }
    try {
      await ctx.editMessageText(t('setting_cancelled', ctx.session.language || 'English'));
      await ctx.scene.leave();
    } catch (err) {
      logger.error(err, 'Failed to edit cancel message');
    } finally {
      ctx.session.processing = false;
    }
  });

  settingsAgeScene.on('text', async (ctx) => {
    if (ctx.session.processing) return;
    ctx.session.processing = true;
    try {
      const lang = ctx.session.language || 'English';
      const age = parseInt(ctx.message.text, 10);
      try { await ctx.deleteMessage(ctx.message.message_id); } catch (err) {}
      if (isNaN(age) || age < 1 || age > 150) {
        ctx.session.processing = false;
        return ctx.reply(t('invalid_age', lang));
      }
      await updateUserProfile(ctx.from.id, age, null, null);
      await ctx.reply(t('age_updated', lang));
      await ctx.scene.leave();
    } finally {
      ctx.session.processing = false;
    }
  });

  settingsAgeScene.on('message', async (ctx, next) => {
    if (!ctx.message || ctx.message.text) return next();
    const lang = ctx.session.language || 'English';
    try { await ctx.deleteMessage(ctx.message.message_id); } catch (err) {}
    await ctx.reply(t('invalid_age', lang));
  });

  return settingsAgeScene;
}

module.exports = { createSettingsAgeScene };

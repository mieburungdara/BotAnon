/**
 * Settings Actions Handler — all setting_* and set_* callback actions.
 */
const { t } = require('../../locales');
const logger = require('../../utils/logger');
const { getUserByTelegramId, updateUserZodiac, updateUserProfile } = require('../../services/userService');
const { getActiveChatByTelegramId } = require('../../services/chatService');

function registerSettingsActions(bot) {
  bot.action('setting_age', async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    try { await ctx.answerCbQuery(); } catch (e) { ctx.session.processing = false; return; }
    try {
      const user = await getUserByTelegramId(ctx.from.id);
      if (user && await getActiveChatByTelegramId(ctx.from.id)) {
        ctx.session.processing = false;
        return ctx.answerCbQuery(t('cannot_open_settings_in_chat', user.language || 'English'), { show_alert: true });
      }
    } catch (e) { logger.error(e, 'Settings guard check failed for setting_age'); }
    try {
      await ctx.scene.enter('settingsAgeScene');
    } catch (err) {
      logger.error(err, 'Failed to enter settingsAgeScene');
    } finally {
      ctx.session.processing = false;
    }
  });

  bot.action('setting_gender', async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    try { await ctx.answerCbQuery(); } catch (e) { ctx.session.processing = false; return; }
    try {
      const user = await getUserByTelegramId(ctx.from.id);
      if (user && await getActiveChatByTelegramId(ctx.from.id)) {
        ctx.session.processing = false;
        return ctx.answerCbQuery(t('cannot_open_settings_in_chat', user.language || 'English'), { show_alert: true });
      }
    } catch (e) { logger.error(e, 'Settings guard check failed for setting_gender'); }
    try {
      const lang = ctx.session.language || 'English';
      await ctx.editMessageText(t('select_gender_settings', lang), { reply_markup: { inline_keyboard: [[{ text: t('btn_male', lang), callback_data: 'set_gender_male' }], [{ text: t('btn_female', lang), callback_data: 'set_gender_female' }]] } });
    } catch (err) {
      logger.error(err, 'Failed to edit gender settings message');
    } finally {
      ctx.session.processing = false;
    }
  });

  bot.action('setting_language', async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    try { await ctx.answerCbQuery(); } catch (e) { ctx.session.processing = false; return; }
    try {
      const user = await getUserByTelegramId(ctx.from.id);
      if (user && await getActiveChatByTelegramId(ctx.from.id)) {
        ctx.session.processing = false;
        return ctx.answerCbQuery(t('cannot_open_settings_in_chat', user.language || 'English'), { show_alert: true });
      }
    } catch (e) { logger.error(e, 'Settings guard check failed for setting_language'); }
    try {
      const lang = ctx.session.language || 'English';
      await ctx.editMessageText(t('select_language_settings', lang), { reply_markup: { inline_keyboard: [[{ text: 'English', callback_data: 'set_lang_en' }], [{ text: 'Indonesian', callback_data: 'set_lang_id' }], [{ text: 'Spanish', callback_data: 'set_lang_es' }], [{ text: 'French', callback_data: 'set_lang_fr' }], [{ text: 'Arabic (العربية)', callback_data: 'set_lang_ar' }]] } });
    } catch (err) {
      logger.error(err, 'Failed to edit language settings message');
    } finally {
      ctx.session.processing = false;
    }
  });

  bot.action('setting_zodiac', async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    try { await ctx.answerCbQuery(); } catch (e) { ctx.session.processing = false; return; }
    try {
      const user = await getUserByTelegramId(ctx.from.id);
      if (user && await getActiveChatByTelegramId(ctx.from.id)) {
        ctx.session.processing = false;
        return ctx.answerCbQuery(t('cannot_open_settings_in_chat', user.language || 'English'), { show_alert: true });
      }
    } catch (e) { logger.error(e, 'Settings guard check failed for setting_zodiac'); }
    try {
      const lang = ctx.session.language || 'English';
      const zKeys = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
      const sObj = t('zodiac_signs', lang) || {};
      const buttons = [];
      for (let i = 0; i < zKeys.length; i += 3)
        buttons.push(zKeys.slice(i, i + 3).map(z => ({ text: sObj[z] || z, callback_data: `set_zodiac_${z}` })));
      await ctx.editMessageText(t('select_zodiac', lang), { reply_markup: { inline_keyboard: buttons } });
    } catch (err) {
      logger.error(err, 'Failed to edit zodiac settings message');
    } finally {
      ctx.session.processing = false;
    }
  });

  bot.action(/set_zodiac_(.+)/, async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    try { await ctx.answerCbQuery(); } catch (e) { ctx.session.processing = false; return; }
    try {
      const zKeys = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
      if (!zKeys.includes(ctx.match[1])) { ctx.session.processing = false; return; }
      await updateUserZodiac(ctx.from.id, ctx.match[1]);
      const user = await getUserByTelegramId(ctx.from.id);
      const lang = (user && user.language) || 'English';
      await ctx.editMessageText(t('zodiac_updated', lang));
    } catch (err) {
      logger.error(err, 'Zodiac update error');
    } finally {
      ctx.session.processing = false;
    }
  });

  bot.action(/set_gender_(.+)/, async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    try { await ctx.answerCbQuery(); } catch (e) { ctx.session.processing = false; return; }
    try {
      const gender = ctx.match[1];
      if (gender !== 'male' && gender !== 'female') { ctx.session.processing = false; return; }
      await updateUserProfile(ctx.from.id, null, gender, null);
      const user = await getUserByTelegramId(ctx.from.id);
      const lang = (user && user.language) || 'English';
      await ctx.editMessageText(t('gender_updated', lang));
    } catch (err) {
      logger.error(err, 'Gender update error');
    } finally {
      ctx.session.processing = false;
    }
  });

  bot.action(/set_lang_(.+)/, async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    try { await ctx.answerCbQuery(); } catch (e) { ctx.session.processing = false; return; }
    try {
      const langMap = { en: 'English', id: 'Indonesian', es: 'Spanish', fr: 'French', ar: 'Arabic' };
      const language = langMap[ctx.match[1]];
      if (!language) { ctx.session.processing = false; return; }
      ctx.session.language = language;
      await updateUserProfile(ctx.from.id, null, null, language);
      await ctx.editMessageText(t('language_updated', language));
    } catch (err) {
      logger.error(err, 'Language update error');
    } finally {
      ctx.session.processing = false;
    }
  });
}

module.exports = { registerSettingsActions };

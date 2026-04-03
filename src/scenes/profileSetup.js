/**
 * Profile Setup Scene — guides new users through age, gender, language, and zodiac setup.
 */
const { Scenes } = require('telegraf');
const { t } = require('../locales');
const logger = require('../utils/logger');
const { updateUserProfile, updateUserZodiac, updateUserState } = require('../services/userService');

function createProfileSetupScene(findMatchForUser) {
  const profileSetup = new Scenes.BaseScene('profileSetup');

  profileSetup.enter(async (ctx) => {
    const lang = ctx.session.language || 'English';
    const msg = await ctx.reply(t('please_enter_age', lang));
    ctx.session.setupMsgId = msg.message_id;
  });

  profileSetup.on('text', async (ctx) => {
    const lang = ctx.session.language || 'English';
    const age = parseInt(ctx.message.text, 10);
    try { await ctx.deleteMessage(ctx.message.message_id); } catch (err) {}
    if (isNaN(age) || age < 1 || age > 150) {
      if (ctx.session.setupMsgId) {
        try { await ctx.telegram.editMessageText(ctx.chat.id, ctx.session.setupMsgId, null, t('invalid_age', lang)); return; } catch (e) {}
      }
      return ctx.reply(t('invalid_age', lang));
    }
    ctx.session.age = age;
    const text = t('select_gender', lang);
    const markup = { inline_keyboard: [[{ text: t('btn_male', lang), callback_data: 'gender_male' }], [{ text: t('btn_female', lang), callback_data: 'gender_female' }]] };
    if (ctx.session.setupMsgId) {
      try { await ctx.telegram.editMessageText(ctx.chat.id, ctx.session.setupMsgId, null, text, { reply_markup: markup }); } 
      catch (e) { const msg = await ctx.reply(text, { reply_markup: markup }); ctx.session.setupMsgId = msg.message_id; }
    } else {
      const msg = await ctx.reply(text, { reply_markup: markup }); ctx.session.setupMsgId = msg.message_id;
    }
  });

  profileSetup.on('message', async (ctx, next) => {
    if (!ctx.message || ctx.message.text) return next();
    const lang = ctx.session.language || 'English';
    try { await ctx.deleteMessage(ctx.message.message_id); } catch (err) {}
    await ctx.reply(t('invalid_age', lang));
  });

  profileSetup.action(/gender_(.+)/, async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    try { await ctx.answerCbQuery(); } catch (e) { ctx.session.processing = false; return; }
    try {
      const lang = ctx.session.language || 'English';
      const gender = ctx.match[1];
      if (gender !== 'male' && gender !== 'female') { ctx.session.processing = false; return; }
      ctx.session.gender = gender;
      await ctx.editMessageText(t('select_language', lang), { reply_markup: { inline_keyboard: [[{ text: 'English', callback_data: 'lang_en' }], [{ text: 'Indonesian', callback_data: 'lang_id' }], [{ text: 'Spanish', callback_data: 'lang_es' }], [{ text: 'French', callback_data: 'lang_fr' }], [{ text: 'Arabic (العربية)', callback_data: 'lang_ar' }]] } });
    } catch (err) {
      logger.error(err, 'Failed to edit gender selection message');
    } finally {
      ctx.session.processing = false;
    }
  });

  profileSetup.action(/lang_(.+)/, async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    try { await ctx.answerCbQuery(); } catch (e) { ctx.session.processing = false; return; }
    try {
      const langMap = { en: 'English', id: 'Indonesian', es: 'Spanish', fr: 'French', ar: 'Arabic' };
      const language = langMap[ctx.match[1]];
      if (!language) { ctx.session.processing = false; return; }
      ctx.session.language = language;
      await updateUserProfile(ctx.from.id, ctx.session.age, ctx.session.gender, language);
      const zodiacKeys = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
      const signs = t('zodiac_signs', language);
      const sObj = (typeof signs === 'object' && signs !== null) ? signs : {};
      const buttons = [];
      for (let i = 0; i < zodiacKeys.length; i += 3) {
        buttons.push(zodiacKeys.slice(i, i + 3).map(z => ({ text: sObj[z] || z, callback_data: `zodiac_${z}` })));
      }
      await ctx.editMessageText(t('select_zodiac', language), { reply_markup: { inline_keyboard: buttons } });
    } catch (err) {
      logger.error(err, 'Failed to edit language selection message');
    } finally {
      ctx.session.processing = false;
    }
  });

  profileSetup.action(/zodiac_(.+)/, async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    try { await ctx.answerCbQuery(); } catch (e) { ctx.session.processing = false; return; }
    try {
      const zodiac = ctx.match[1];
      const zKeys = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
      if (!zKeys.includes(zodiac)) { ctx.session.processing = false; return; }
      const tid = ctx.from.id; const lang = ctx.session.language || 'English';
      await updateUserZodiac(tid, zodiac);
      await updateUserState(tid, 'waiting');
      await ctx.editMessageText(t('profile_completed', lang));
      try {
        await findMatchForUser(tid, lang);
      } catch (e) {
        logger.error(e, 'Profile setup match error');
      }
      await ctx.scene.leave();
    } catch (err) {
      logger.error(err, 'Zodiac selection error');
    } finally {
      ctx.session.processing = false;
    }
  });

  return profileSetup;
}

module.exports = { createProfileSetupScene };

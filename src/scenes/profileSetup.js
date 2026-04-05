/**
 * Profile Setup Scene — guides new users through age, gender, language, and zodiac setup.
 */
const { Scenes } = require('telegraf');
const { t } = require('../locales');
const logger = require('../utils/logger');
const { updateUserProfile, updateUserZodiac, updateUserState, getUserByTelegramId } = require('../services/userService');
const { db } = require('../database');

function createProfileSetupScene(findMatchForUser) {
  const profileSetup = new Scenes.BaseScene('profileSetup');

  profileSetup.enter(async (ctx) => {
    const lang = ctx.session.language || 'English';
    const msg = await ctx.reply(t('please_enter_age', lang));
    ctx.session.setupMsgId = msg.message_id;
  });

  profileSetup.on('text', async (ctx) => {
    if (ctx.session.processing) return;
    const lang = ctx.session.language || 'English';
    const age = parseInt(ctx.message.text, 10);
    try { await ctx.deleteMessage(ctx.message.message_id); } catch (err) {}
    
    // ✅ Fix L2: Limit maximum age to 100 for better data integrity
    if (isNaN(age) || age < 1 || age > 100) {
      if (ctx.session.setupMsgId) {
        try { await ctx.telegram.editMessageText(ctx.from.id, ctx.session.setupMsgId, null, t('invalid_age', lang)); return; } catch (e) {}
      }
      return ctx.reply(t('invalid_age', lang));
    }
    
    ctx.session.age = age;
    const text = t('select_gender', lang);
    const markup = { inline_keyboard: [[{ text: t('btn_male', lang), callback_data: 'gender_male' }], [{ text: t('btn_female', lang), callback_data: 'gender_female' }]] };
    
    if (ctx.session.setupMsgId) {
      try { await ctx.telegram.editMessageText(ctx.from.id, ctx.session.setupMsgId, null, text, { reply_markup: markup }); } 
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
    try { await ctx.answerCbQuery(); } catch (e) {}
    try {
      const lang = ctx.session.language || 'English';
      const gender = ctx.match[1];
      if (gender !== 'male' && gender !== 'female') return;
      ctx.session.gender = gender;
      await ctx.editMessageText(t('select_language', lang), { 
        reply_markup: { 
          inline_keyboard: [
            [{ text: 'English', callback_data: 'lang_en' }], 
            [{ text: 'Indonesian', callback_data: 'lang_id' }], 
            [{ text: 'Spanish', callback_data: 'lang_es' }], 
            [{ text: 'French', callback_data: 'lang_fr' }], 
            [{ text: 'Arabic (العربية)', callback_data: 'lang_ar' }]
          ] 
        } 
      });
    } catch (err) {
      logger.error(err, 'Failed to edit gender selection message');
    } finally {
      ctx.session.processing = false;
    }
  });

  profileSetup.action(/lang_(.+)/, async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    try { await ctx.answerCbQuery(); } catch (e) {}
    try {
      const langMap = { en: 'English', id: 'Indonesian', es: 'Spanish', fr: 'French', ar: 'Arabic' };
      const language = langMap[ctx.match[1]];
      if (!language) return;
      
      // ✅ SIMPAN DI SESSION SAJA, JANGAN DI DB DULU (ATOMIC PREV)
      ctx.session.language = language;
      
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

  // ✅ FIX Bug #105: Handle global commands inside scene to prevent trapping users
  profileSetup.command(['start', 'find', 'stop', 'help'], async (ctx) => {
    ctx.session.processing = false;
    ctx.session.setupMsgId = null;
    await ctx.scene.leave();
    return ctx.reply(t('setup_cancelled', ctx.session.language || 'English'));
  });

  profileSetup.action(/zodiac_(.+)/, async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    try { await ctx.answerCbQuery(); } catch (e) {}
    try {
      const zodiac = ctx.match[1];
      const zKeys = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
      if (!zKeys.includes(zodiac)) return;
      
      const tid = ctx.from.id; 
      const lang = ctx.session.language || 'English';
      const age = ctx.session.age;
      const gender = ctx.session.gender;

      if (!age || !gender || !lang) {
          await ctx.reply(t('something_went_wrong', lang));
          return ctx.scene.reenter();
      }

      // Ensures user is NEVER in 'waiting' state without being in the queue
      // ✅ FIX K3: Removed dynamic requires from inside handler callback
      
      await db.transaction(async (tx) => {
          const user = await getUserByTelegramId(tid, tx);
          if (!user) throw new Error('User not found during profile setup');

          await updateUserProfile(tid, age, gender, lang, tx);
          await updateUserZodiac(tid, zodiac, tx);
          await updateUserState(tid, 'idle', tx);
      });

      if (ctx.session.setupMsgId) {
        try { await ctx.telegram.editMessageText(ctx.from.id, ctx.session.setupMsgId, null, t('profile_completed', lang)); } catch(e) {}
      } else {
        await ctx.reply(t('profile_completed', lang));
      }
      
      ctx.session.age = null;
      ctx.session.gender = null;
      ctx.session.setupMsgId = null;

      try {
        await findMatchForUser(tid, lang);
      } catch (e) {
        logger.error(e, 'Profile setup match error');
      }
      await ctx.scene.leave();
    } catch (err) {
      logger.error(err, 'Zodiac selection error');
      await ctx.reply(t('something_went_wrong', ctx.session.language || 'English')).catch(() => {});
    } finally {
      ctx.session.processing = false;
    }
  });

  return profileSetup;
}

module.exports = { createProfileSetupScene };

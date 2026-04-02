/**
 * Matchmaking Service — partner matching, compatibility, and rating logic.
 */
const { db } = require('../database');
const { t } = require('../locales');
const logger = require('../utils/logger');
const { escapeMarkdown } = require('../utils/markdown');
const { endChat } = require('./chatService');
const { updateUserState, getUserById } = require('./userService');

function getZodiacCompatibility(z1, z2) {
  if (!z1 || !z2) return 50;
  const matrix = {
    Aries:       { Aries: 50, Taurus: 38, Gemini: 83, Cancer: 42, Leo: 97, Virgo: 63, Libra: 85, Scorpio: 50, Sagittarius: 93, Capricorn: 47, Aquarius: 78, Pisces: 67 },
    Taurus:      { Aries: 38, Taurus: 65, Gemini: 33, Cancer: 97, Leo: 73, Virgo: 90, Libra: 65, Scorpio: 88, Sagittarius: 30, Capricorn: 98, Aquarius: 58, Pisces: 85 },
    Gemini:      { Aries: 83, Taurus: 33, Gemini: 60, Cancer: 25, Leo: 88, Virgo: 68, Libra: 93, Scorpio: 28, Sagittarius: 60, Capricorn: 68, Aquarius: 85, Pisces: 53 },
    Cancer:      { Aries: 42, Taurus: 97, Gemini: 25, Cancer: 75, Leo: 35, Virgo: 90, Libra: 43, Scorpio: 94, Sagittarius: 53, Capricorn: 83, Aquarius: 27, Pisces: 98 },
    Leo:         { Aries: 97, Taurus: 73, Gemini: 88, Cancer: 35, Leo: 45, Virgo: 35, Libra: 97, Scorpio: 58, Sagittarius: 93, Capricorn: 35, Aquarius: 68, Pisces: 38 },
    Virgo:       { Aries: 63, Taurus: 90, Gemini: 68, Cancer: 90, Leo: 35, Virgo: 65, Libra: 68, Scorpio: 88, Sagittarius: 48, Capricorn: 95, Aquarius: 30, Pisces: 88 },
    Libra:       { Aries: 85, Taurus: 65, Gemini: 93, Cancer: 43, Leo: 97, Virgo: 68, Libra: 75, Scorpio: 35, Sagittarius: 73, Capricorn: 55, Aquarius: 90, Pisces: 88 },
    Scorpio:     { Aries: 50, Taurus: 88, Gemini: 28, Cancer: 94, Leo: 58, Virgo: 88, Libra: 35, Scorpio: 80, Sagittarius: 73, Capricorn: 95, Aquarius: 73, Pisces: 97 },
    Sagittarius: { Aries: 93, Taurus: 30, Gemini: 60, Cancer: 53, Leo: 93, Virgo: 48, Libra: 73, Scorpio: 73, Sagittarius: 45, Capricorn: 60, Aquarius: 90, Pisces: 63 },
    Capricorn:   { Aries: 47, Taurus: 98, Gemini: 68, Cancer: 83, Leo: 35, Virgo: 95, Libra: 55, Scorpio: 95, Sagittarius: 60, Capricorn: 75, Aquarius: 68, Pisces: 88 },
    Aquarius:    { Aries: 78, Taurus: 58, Gemini: 85, Cancer: 27, Leo: 68, Virgo: 30, Libra: 90, Scorpio: 73, Sagittarius: 90, Capricorn: 68, Aquarius: 45, Pisces: 45 },
    Pisces:      { Aries: 67, Taurus: 85, Gemini: 53, Cancer: 98, Leo: 38, Virgo: 88, Libra: 88, Scorpio: 97, Sagittarius: 63, Capricorn: 88, Aquarius: 45, Pisces: 60 },
  };
  const sign1 = Object.keys(matrix).find(k => k.toLowerCase() === z1.toLowerCase());
  const sign2 = Object.keys(matrix).find(k => k.toLowerCase() === z2.toLowerCase());
  return (!sign1 || !sign2 || !matrix[sign1][sign2]) ? 50 : matrix[sign1][sign2];
}

async function sendRatingPrompt(bot, telegramId, ratedId, lang) {
  const text = t('rate_partner', lang);
  const posText = t('rate_positive', lang);
  const negText = t('rate_negative', lang);
  const buttons = [
    [
      { text: posText, callback_data: `rate_${ratedId}_pos` },
      { text: negText, callback_data: `rate_${ratedId}_neg` }
    ]
  ];
  try {
    await bot.telegram.sendMessage(telegramId, text, { reply_markup: { inline_keyboard: buttons } });
  } catch (err) {
    if (err.response && err.response.error_code === 403) {
      // User blocked the bot, this is expected
    } else {
      logger.error(err, 'Error sending rating prompt');
    }
  }
}

function getPartnerInfo(role, pUser, lang, signsObj, mainUser) {
  let info = '';
  if (role === 'admin') {
    const parts = [];
    if (pUser.age) parts.push(`🎂 ${t('btn_age', lang)}: ${pUser.age}`);
    if (pUser.gender) parts.push(`👤 ${t('btn_gender', lang)}: ${t(`btn_${pUser.gender}`, lang) || pUser.gender}`);
    if (parts.length) info = '\n' + parts.join(' | ');
  } else if (role === 'vip') {
    const parts = [];
    if (pUser.gender) parts.push(`👤 ${t('btn_gender', lang)}: ${t(`btn_${pUser.gender}`, lang) || pUser.gender}`);
    if (pUser.zodiac) parts.push(`${signsObj[pUser.zodiac] || pUser.zodiac}`);
    if (parts.length) info = '\n' + parts.join(' | ');
  }
  if (role !== 'admin' && mainUser.zodiac && pUser.zodiac) {
    const compat = getZodiacCompatibility(mainUser.zodiac, pUser.zodiac);
    const pSign = signsObj[pUser.zodiac] || pUser.zodiac;
    info += (role === 'user' ? `\n\n✨ ${pSign}\n` : '\n✨ ') + t('zodiac_compatibility', lang).replace('{percentage}', compat);
  }
  return info;
}

async function findMatchForUser(bot, telegramId, userLang, _depth = 0) {
  try {
    const DB_MODE = (process.env.DB_MODE || 'sqlite').toLowerCase();
    const matchResult = await db.transaction(async (tx) => {
      const query = DB_MODE === 'postgresql'
        ? 'SELECT * FROM users WHERE state = $1 AND telegram_id != $2 AND language = $3 ORDER BY updated_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED'
        : 'SELECT * FROM users WHERE state = $1 AND telegram_id != $2 AND language = $3 ORDER BY updated_at ASC LIMIT 1';
      
      const wRes = await tx.query(query, ['waiting', telegramId.toString(), userLang]);
      const waitingUser = wRes.rows[0];
      if (!waitingUser) return null;
      // FIX Bug #5: Lock the initiator's row too to prevent double-matching
      const initiatorQuery = DB_MODE === 'postgresql'
        ? 'SELECT * FROM users WHERE telegram_id = $1 FOR UPDATE'
        : 'SELECT * FROM users WHERE telegram_id = $1';
      const uRes = await tx.query(initiatorQuery, [telegramId.toString()]);
      const user = uRes.rows[0];
      if (!user || user.state !== 'waiting' || waitingUser.state !== 'waiting') return null;

      await tx.query('UPDATE users SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2', ['chatting', telegramId.toString()]);
      await tx.query('UPDATE users SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2', ['chatting', waitingUser.telegram_id.toString()]);
      const chatRes = await tx.query('INSERT INTO chats (user1_id, user2_id) VALUES ($1, $2) RETURNING *', [user.id, waitingUser.id]);
      const chat = chatRes.rows[0];
      return { user, waitingUser, chat };
    });

    if (!matchResult) return false;
    const { user, waitingUser, chat } = matchResult;
    
    const partnerLang = waitingUser.language || 'English';
    const signs1 = t('zodiac_signs', userLang);
    const s1Obj = (typeof signs1 === 'object' && signs1 !== null) ? signs1 : {};
    const signs2 = t('zodiac_signs', partnerLang);
    const s2Obj = (typeof signs2 === 'object' && signs2 !== null) ? signs2 : {};

    const info1 = getPartnerInfo(user.role || 'user', waitingUser, userLang, s1Obj, user);
    const info2 = getPartnerInfo(waitingUser.role || 'user', user, partnerLang, s2Obj, waitingUser);

    // FIX Bugs #1,#4,#25,#26: Send connected notification to BOTH users (not just partner)
    // and remove the duplicate try-catch block.
    // info1 = partner info shown to initiator, info2 = initiator info shown to partner

    // Step 1: Notify the initiator (telegramId) about their partner
    try {
      const safeInfo1 = escapeMarkdown(info1);
      await bot.telegram.sendMessage(telegramId, t('now_connected', userLang) + safeInfo1, { parse_mode: 'Markdown' });
    } catch (initiatorErr) {
      // Initiator blocked the bot right after matching!
      await endChat(chat.id);
      await updateUserState(telegramId, 'idle');
      // Re-match the innocent partner since they were genuinely waiting
      await updateUserState(waitingUser.telegram_id, 'waiting');
      // FIX Bugs #7,#8: Use depth limiting to prevent infinite recursion
      if (_depth < 3) {
        findMatchForUser(bot, waitingUser.telegram_id, partnerLang, _depth + 1).catch(e => logger.error(e, 'Re-match failed'));
      }
      return false;
    }

    // Step 2: Notify the partner (waitingUser) about the initiator
    try {
      const safeInfo2 = escapeMarkdown(info2);
      await bot.telegram.sendMessage(waitingUser.telegram_id, t('now_connected', partnerLang) + safeInfo2, { parse_mode: 'Markdown' });
    } catch (partnerErr) {
      // Partner blocked bot at the last second!
      await endChat(chat.id);
      // The partner blocked, so they should be idle.
      // The initiator did nothing wrong — set them to 'waiting' and re-match.
      await updateUserState(waitingUser.telegram_id, 'idle');
      await updateUserState(telegramId, 'waiting');
      try { await bot.telegram.sendMessage(telegramId, t('partner_not_found', userLang)); } catch (e) { /* initiator also blocked */ }
      // Re-match the innocent initiator, not the blocker
      // FIX Bugs #7,#8: Use depth limiting to prevent infinite recursion
      if (_depth < 3) {
        findMatchForUser(bot, telegramId, userLang, _depth + 1).catch(e => logger.error(e, 'Re-match failed'));
      }
      return false;
    }

    return true;
  } catch (err) {
    logger.error(err, 'Error in findMatchForUser');
    return false;
  }
}

module.exports = {
  getZodiacCompatibility,
  getPartnerInfo,
  sendRatingPrompt,
  findMatchForUser,
};

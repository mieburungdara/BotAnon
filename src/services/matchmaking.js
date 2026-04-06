/**
 * Matchmaking Service — partner matching, compatibility, and rating logic.
 */
const { db } = require('../database');
const { t } = require('../locales');
const logger = require('../utils/logger');
const { endChat } = require('./chatService');
const { updateUserState } = require('./userService');
const { transitionToChatting, transitionOnBlock } = require('./stateMachine');

function getZodiacCompatibility(z1, z2) {
  if (!z1 || !z2 || typeof z1 !== 'string' || typeof z2 !== 'string') return 50;
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

async function sendRatingPrompt(bot, telegramId, ratedTelegramId, lang) {
  const text = t('rate_partner', lang);
  const posText = t('rate_positive', lang);
  const negText = t('rate_negative', lang);
  const buttons = [
    [
      { text: posText, callback_data: `rate_${ratedTelegramId}_pos` },
      { text: negText, callback_data: `rate_${ratedTelegramId}_neg` }
    ]
  ];
  try {
    await bot.telegram.sendMessage(telegramId, text, { reply_markup: { inline_keyboard: buttons } });
  } catch (err) {
    // Ignore blocks
  }
}

function getPartnerInfo(role, pUser, lang, signsObj, mainUser) {
  let info = '';
  // ✅ ADMIN VISIBILITY: Show full user details only to role='admin'
  if (role === 'admin') {
    const parts = [];
    parts.push(`🆔 <b>ID:</b> <code>${pUser.id || 'N/A'}</code>`);
    if (pUser.username) parts.push(`👤 <b>User:</b> @${pUser.username}`);
    const fullName = [pUser.first_name, pUser.last_name].filter(Boolean).join(' ');
    if (fullName) parts.push(`📝 <b>Name:</b> ${fullName}`);
    
    // Additional Profile Info
    const profileParts = [];
    if (pUser.age) profileParts.push(`🎂 ${pUser.age}`);
    if (pUser.gender) profileParts.push(`👤 ${t(`btn_${pUser.gender}`, lang) || pUser.gender}`);
    if (pUser.zodiac) profileParts.push(`${signsObj[pUser.zodiac] || pUser.zodiac}`);
    
    info = '\n' + parts.join('\n') + (profileParts.length ? '\n' + profileParts.join(' | ') : '');
  } 
  // ✅ VIP/USER VISIBILITY: Stay anonymous
  else if (role === 'vip') {
    const parts = [];
    if (pUser.age) parts.push(`🎂 ${t('btn_age', lang)}: ${pUser.age}`);
    if (pUser.gender) parts.push(`👤 ${t('btn_gender', lang)}: ${t(`btn_${pUser.gender}`, lang) || pUser.gender}`);
    if (pUser.zodiac) parts.push(`${signsObj[pUser.zodiac] || pUser.zodiac}`);
    if (parts.length) info = '\n' + parts.join(' | ');
  }
  
  if (mainUser.zodiac && pUser.zodiac) {
    const compat = getZodiacCompatibility(mainUser.zodiac, pUser.zodiac);
    const pSign = signsObj[pUser.zodiac] || pUser.zodiac;
    const zodiacPrefix = (role === 'user' ? `\n\n✨ ${pSign}\n` : '\n✨ ');
    info += zodiacPrefix + t('zodiac_compatibility', lang).replace('{percentage}', compat);
  }
  return info;
}

async function findMatchForUser(bot, telegramId, userLang, _depth = 0) {
  try {
    const tid = BigInt(telegramId);
    
    const matchResult = await db.transaction(async (tx) => {
      // ✅ Fetch full details for the initiator
      const uRes = await tx.query('SELECT * FROM users WHERE telegram_id = $1', [tid]);
      const user = uRes.rows[0];
      if (!user) return null;

      const targetLang = userLang || user.language || 'English';

      // ✅ Fetch full details for the partner in queue
      const qQuery = 'SELECT * FROM users WHERE state = $1 AND language = $2 AND id != $3 ORDER BY waiting_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED';
      
      const qRes = await tx.query(qQuery, ['waiting', targetLang, user.id]);
      const waitingUser = qRes.rows[0];

      if (waitingUser) {
        // We found a match! Directly update both users to 'chatting' and clear waiting_at
        const newChat = await transitionToChatting(user.telegram_id, waitingUser.telegram_id, tx);
        return { user, waitingUser, chat: newChat };
      }

// ✅ FIX Bug M3: Transition initiator into 'waiting' queue ATOMICALLY within this transaction
       const ts = new Date();
       await tx.query(`UPDATE users SET state = 'waiting', waiting_at = COALESCE(waiting_at, $2), updated_at = $2 WHERE id = $1`, [user.id, ts]);
      return null;
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

    // Step 1: Notify Initiator
    try {
      const msg1 = t('now_connected', userLang) + info1;
      await bot.telegram.sendMessage(telegramId, msg1, { parse_mode: 'HTML' });
    } catch (err) {
      const isBlocked = (err.response && err.response.error_code === 403);
      // ✅ FIX Bug #I: Correct argument order — tid is the one who BLOCKED the bot (notification failed to tid),
      // so waitingUser is the innocent one who should stay in the waiting queue.
      if (isBlocked) {
          await transitionOnBlock(waitingUser.telegram_id, tid);
      } else {
          if (chat) await endChat(chat.id);
          await updateUserState(tid, 'waiting');
          await updateUserState(waitingUser.telegram_id, 'waiting');
      }
      return false;
    }

    // Step 2: Notify Partner
    try {
      const msg2 = t('now_connected', partnerLang) + info2;
      await bot.telegram.sendMessage(waitingUser.telegram_id, msg2, { parse_mode: 'HTML' });
    } catch (err) {
      const isBlocked = (err.response && err.response.error_code === 403);
      if (isBlocked) {
          await transitionOnBlock(tid, waitingUser.telegram_id);
      } else {
          if (chat) await endChat(chat.id);
          await updateUserState(waitingUser.telegram_id, 'waiting');
          await updateUserState(tid, 'waiting');
      }
      
      // Auto-retry for innocent initiator if partner just blocked
      if (isBlocked && _depth < 3) {
          setTimeout(() => findMatchForUser(bot, tid, userLang, _depth + 1), 500);
      }
      return false;
    }

    return true;
  } catch (err) {
    logger.error(err, 'Critical error in matchmaking');
    return false;
  }
}

module.exports = {
  getZodiacCompatibility,
  getPartnerInfo,
  sendRatingPrompt,
  findMatchForUser,
};

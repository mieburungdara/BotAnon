/**
 * Session Middleware — persistent session storage backed by the database.
 */
const { db } = require('../database');
const { t } = require('../locales');
const logger = require('../utils/logger');

function createSessionMiddleware() {
  return async (ctx, next) => {
    if (!ctx.from) return next();
    const key = `session:${ctx.from.id}`;
    let origStr = '{}';
    try {
      const res = await db.query('SELECT data FROM sessions WHERE `key` = $1', [key]);
      origStr = res.rows[0] ? res.rows[0].data : '{}';
      ctx.session = JSON.parse(origStr);
    } catch (err) {
      origStr = '{}';
      if (!ctx.session) ctx.session = {};
    }

    // ✅ Fix processing flag deadlock: Reset jika sudah lebih dari 5 detik (bukan 30 detik)
    // Jika bot crash di tengah handler, user tidak akan terblokir 30 detik
    if (ctx.session.processing && ctx.session.lastMsgTime) {
      const age = Date.now() - ctx.session.lastMsgTime;
      if (age > 5000) {
        ctx.session.processing = false;
        logger.debug('Stale processing flag cleared automatically', { userId: ctx.from.id, age });
      }
    }
    
    // FIX Bug #10: Skip anti-spam check on first message (lastTime === 0 means brand new session)
    const now = Date.now();
    const lastTime = ctx.session.lastMsgTime || 0;
    // ✅ FIX Bug #7: Skip rate limit for callback queries (button presses) — only throttle messages
    const isCallbackQuery = !!ctx.callbackQuery;
    // ✅ Perbaiki rate limit: 300ms (bukan 1 detik) agar tidak memblokir user yang mengetik cepat
    if (!isCallbackQuery && lastTime && now - lastTime < 300) {
      const lang = (ctx.session && ctx.session.language) || 'English';
      try { await ctx.reply('⚠️ ' + t('anti_spam_warning', lang)); } catch (e) {}
      return;
    }
    ctx.session.lastMsgTime = now;
    
    await next();
    
    try {
      if (!ctx.session) ctx.session = {};
      
      // ✅ FIX Bug #125: Ensure JSON stringification is atomic and clean
      const currStr = JSON.stringify(ctx.session);
      if (currStr === origStr) return;
      
      // MySQL UPSERT Atomic
      await db.query(`
        INSERT INTO sessions (\`key\`, data, updated_at) 
        VALUES ($1, $2, CURRENT_TIMESTAMP) 
        ON DUPLICATE KEY UPDATE 
        data = VALUES(data), updated_at = CURRENT_TIMESTAMP
      `, [key, currStr]);
    } catch (err) {
      logger.error(err, 'Failed to save session (atomic attempt)');
    }
  };
}

module.exports = { createSessionMiddleware };

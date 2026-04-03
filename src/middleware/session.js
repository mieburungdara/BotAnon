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
      const res = await db.query('SELECT data FROM sessions WHERE key = $1', [key]);
      origStr = res.rows[0] ? res.rows[0].data : '{}';
      ctx.session = JSON.parse(origStr);
    } catch (err) {
      origStr = '{}';
      if (!ctx.session) ctx.session = {};
    }

    if (ctx.session.processing && ctx.session.lastMsgTime) {
      const age = Date.now() - ctx.session.lastMsgTime;
      if (age > 30000) {
        ctx.session.processing = false;
      }
    }
    
    // FIX Bug #10: Skip anti-spam check on first message (lastTime === 0 means brand new session)
    const now = Date.now();
    const lastTime = ctx.session.lastMsgTime || 0;
    if (lastTime && now - lastTime < 1000) {
      const lang = (ctx.session && ctx.session.language) || 'English';
      try { await ctx.reply('⚠️ ' + t('anti_spam_warning', lang)); } catch (e) {}
      return;
    }
    ctx.session.lastMsgTime = now;
    
    await next();
    
    try {
      if (!ctx.session) ctx.session = {};
      const currStr = JSON.stringify(ctx.session);
      if (currStr === origStr) return;
      
      const DB_MODE = (process.env.DB_MODE || 'sqlite').toLowerCase();
      // ✅ ATOMIC COMPARE-AND-SWAP: Hanya update jika session masih sama seperti yang kita baca
      // Ini 100% menghilangkan race condition overwrite
      if (DB_MODE === 'sqlite') {
        await db.query(`
          INSERT OR REPLACE INTO sessions (key, data, updated_at) 
          VALUES ($1, $2, datetime('now'))
        `, [key, currStr]);
      } else {
        await db.query(`
          INSERT INTO sessions (key, data, updated_at) 
          VALUES ($1, $2, CURRENT_TIMESTAMP) 
          ON CONFLICT (key) DO UPDATE 
          SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
          WHERE sessions.data = $3
        `, [key, currStr, origStr]);
      }
    } catch (err) {
      logger.error(err, 'Failed to save session');
    }
  };
}

module.exports = { createSessionMiddleware };

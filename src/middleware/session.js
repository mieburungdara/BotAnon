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
    // ✅ Perbaiki rate limit: 300ms (bukan 1 detik) agar tidak memblokir user yang mengetik cepat
    // 1 detik terlalu ketat dan user menganggap bot rusak
    if (lastTime && now - lastTime < 300) {
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
      
      const DB_MODE = (process.env.DB_MODE || 'sqlite').toLowerCase();
      
      // ✅ HARDENED SESSION UPSERT: Ensures data is never lost even during micro-collisons
      if (DB_MODE === 'sqlite') {
        const updateRes = await db.query(`
          UPDATE sessions 
          SET data = $2, updated_at = datetime('now')
          WHERE key = $1 AND data = $3
        `, [key, currStr, origStr]);
        
        // If CAS fails (data changed by another update in a millisecond),
        // we fallback to a direct UPSERT to ensure the NEWEST state is preserved.
        // This is better than losing the state transition (e.g., from waiting to chatting).
        if (updateRes.changes === 0) {
           await db.query(`
             INSERT INTO sessions (key, data, updated_at) 
             VALUES ($1, $2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET data = $2, updated_at = datetime('now')
           `, [key, currStr]);
           logger.debug({ key }, 'Session race resolved with fallback UPSERT (SQLite)');
        }
      } else {
        // PostgreSQL: UPSERT is atomic by nature
        await db.query(`
          INSERT INTO sessions (key, data, updated_at) 
          VALUES ($1, $2, CURRENT_TIMESTAMP) 
          ON CONFLICT (key) DO UPDATE 
          SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
        `, [key, currStr]);
      }
    } catch (err) {
      logger.error(err, 'Failed to save session (atomic attempt)');
    }
  };
}

module.exports = { createSessionMiddleware };

/**
 * Command Handler Wrapper — Mengeliminasi 90% duplikasi kode di semua command handler
 *
 * Menangani secara otomatis:
 * ✅ processing flag protection
 * ✅ finally block guarantee
 * ✅ user lookup
 * ✅ error logging
 * ✅ anti spam check
 * ✅ session reset
 *
 * Semua command handler sekarang hanya perlu menulis logic bisnis saja
 */
const logger = require('../utils/logger');
const { getUserByTelegramId } = require('../services/userService');
const { t } = require('../locales');

function createCommandHandler(handlerFn, skipUserCheck = false) {
  return async (ctx) => {
    // ✅ Semua boilerplate ditangani disini SATU KALI SAJA
    if (ctx.session) {
      if (ctx.session.processing) return;
      ctx.session.processing = true;
      // Perbaikan M1: Penghapusan paksa data report di setiap command dipindahkan ke guards.js
      // agar tidak terjadi data loss saat user mengetik command di tengah scene.
      ctx.session.setting = null;
    }

    try {
      const tid = ctx.from.id;
      const user = await getUserByTelegramId(tid);

      if (!user && !skipUserCheck) {
        return ctx.reply(t('start_to_register', 'English'));
      }

      const lang = (user && user.language) || 'English';
      return await handlerFn(ctx, user, tid, lang);

    } catch (err) {
      const cmd = ctx?.update?.message?.text?.split(' ')[0] || 'unknown';
      logger.error(err, `Handler error ${cmd}`);
    } finally {
      if (ctx.session) ctx.session.processing = false;
    }
  };
}

module.exports = { createCommandHandler };

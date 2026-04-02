/**
 * Guards Middleware — command-scene interaction guards.
 */
const { t } = require('../locales');

function createCommandSceneGuard() {
  return async (ctx, next) => {
    if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/')) {
      // Don't interrupt if another operation is processing
      if (ctx.session && ctx.session.processing) return next();
      if (ctx.scene && ctx.scene.current) {
        if (ctx.session) {
          ctx.session.reportDetails = null;
          ctx.session.attachedEvidence = null;
          ctx.session.reportedId = null;
          ctx.session.reportChatId = null;
          ctx.session.reportReason = null;
        }
        await ctx.scene.leave();
      }
    }
    return next();
  };
}

module.exports = { createCommandSceneGuard };

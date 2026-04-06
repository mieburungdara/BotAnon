       if (chatCheck.length === 0) {
         ctx.session.processing = false;
         return ctx.editMessageText('⚠️ ' + t('unauthorized_rating', lang));
       }

       // ✅ FIX Bug M4: Rating time limit (24 hours)
       const lastChatTime = new Date(chatCheck[0].started_at).getTime();
       if (Date.now() - lastChatTime > 24 * 60 * 60 * 1000) {
         ctx.session.processing = false;
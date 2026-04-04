/**
 * Find Command Handler — /find command logic.
 */
const { t } = require('../../locales');
const { db } = require('../../database');
const logger = require('../../utils/logger');
const { getUserByTelegramId, updateUserState } = require('../../services/userService');
const { getActiveChatByTelegramId, getPartnerTelegramId } = require('../../services/chatService');

const { createCommandHandler } = require('../../middleware/commandWrapper');

function registerFindCommand(bot, findMatchForUser, sendRatingPrompt) {
  const handler = createCommandHandler(async (ctx, user, tid, lang) => {
    const activeChat = await getActiveChatByTelegramId(tid);
    
    if (activeChat) {
      // 🔄 CASE: SWITCH PARTNER (Like /next)
      let partnerTid = null;
      let partnerLang = 'English';
      let partnerDbId = null;

      try {
        const pTid = getPartnerTelegramId(activeChat, tid);
        const p = await getUserByTelegramId(pTid);
        if (p) {
          partnerLang = p.language || 'English';
          partnerTid = pTid;
          partnerDbId = p.id;
        }

        await db.transaction(async (tx) => {
          // Commit chat end atomically
          const chatCheck = await tx.query('UPDATE chats SET ended_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE id = $1 AND is_active = TRUE RETURNING *', [activeChat.id]);
          if (chatCheck.rows.length === 0) return;

          await updateUserState(tid, 'waiting', tx);
          
          if (p) {
            // ✅ RULE #4: Partner goes to IDLE and is removed from queue
            await updateUserState(partnerTid, 'idle', tx);
          }
        });

        if (partnerTid) {
          // Notify partner clearly that their partner left to find someone else
          await ctx.telegram.sendMessage(partnerTid, t('partner_ended_chat', partnerLang)).catch(() => {});
          await sendRatingPrompt(partnerTid, user.id, partnerLang);
          await sendRatingPrompt(tid, partnerDbId, lang);
        }
      } catch (err) {
        logger.error(err, 'Switch partner failed in /find');
      }
    } else {
      // New search if not in chat
      if (user.state !== 'waiting') {
        await updateUserState(tid, 'waiting');
      }
    }

    // Trigger matchmaking and WAIT for result
    const wasMatched = await findMatchForUser(tid, lang).catch(e => {
      logger.error(e);
      return false;
    });

    // Final feedback after match attempt
    if (!wasMatched) {
      if (activeChat) {
         await ctx.reply(t('waiting_new_partner', lang));
      } else if (user.state !== 'waiting') {
         await ctx.reply(t('now_waiting', lang));
      } else {
         await ctx.reply(t('already_searching', lang));
      }
    }
  });

  bot.command('find', handler);
  bot.command('next', handler);
  
  return handler;
}

module.exports = { registerFindCommand };

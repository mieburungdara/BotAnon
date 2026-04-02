/**
 * Report Flow Scene — guides users through reporting a partner.
 */
const { Scenes } = require('telegraf');
const { t } = require('../locales');
const { db } = require('../database');
const { getUserById } = require('../services/userService');
const { extractEvidenceFromMessage } = require('../services/reportService');
const { sendRatingPrompt } = require('../services/matchmaking');
const logger = require('../utils/logger');

function createReportFlow(bot, findMatchForUser, submitReport) {
  const reportFlow = new Scenes.BaseScene('reportFlow');

  reportFlow.enter(async (ctx) => {
    const lang = ctx.session.language || 'English';
    const msg = await ctx.reply(t('report_reason_prompt', lang), { reply_markup: { inline_keyboard: [[{ text: t('report_reason_spam', lang), callback_data: 'rep_spam' }], [{ text: t('report_reason_harassment', lang), callback_data: 'rep_harassment' }], [{ text: t('report_reason_inappropriate', lang), callback_data: 'rep_inappropriate' }], [{ text: t('report_reason_other', lang), callback_data: 'rep_other' }]] } });
    ctx.session.reportMsgId = msg.message_id;
  });

  reportFlow.action(/rep_(.+)/, async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true;
    await ctx.answerCbQuery();
    const lang = ctx.session.language || 'English';
    const rMap = { spam: 'Spam/Advertising', harassment: 'Harassment/Abuse', inappropriate: 'Inappropriate Content', other: 'Other' };
    ctx.session.reportReason = rMap[ctx.match[1]] || 'Other';
    if (ctx.session.reportChatId) {
      let partnerForRematch = null;
      let partnerLangForRematch = 'English';
      try {
        await db.transaction(async (tx) => {
          await tx.query('UPDATE chats SET ended_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE id = $1', [ctx.session.reportChatId]);
          await tx.query('UPDATE users SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['idle', ctx.session.userId]);
          const partner = await getUserById(ctx.session.reportedId);
          if (partner && partner.state !== 'idle') {
            await tx.query('UPDATE users SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['waiting', partner.id]);
            partnerForRematch = partner;
            partnerLangForRematch = partner.language || 'English';
          }
        });
        // FIX Bug #7: Move Telegram I/O outside the database transaction
        if (partnerForRematch) {
          try { await ctx.telegram.sendMessage(partnerForRematch.telegram_id, t('partner_ended_chat', partnerLangForRematch)); } catch (pErr) {}
          await sendRatingPrompt(bot, partnerForRematch.telegram_id, ctx.session.userId, partnerLangForRematch);
          findMatchForUser(partnerForRematch.telegram_id, partnerLangForRematch).catch(err => logger.error(err, 'findMatchForUser error'));
        }
      } catch (err) { logger.error(err, 'Report chat cleanup error'); }
    }
        });
        // FIX Bug #7: Move Telegram I/O outside the database transaction
        if (partnerForRematch) {
          try { await ctx.telegram.sendMessage(partnerForRematch.telegram_id, t('partner_ended_chat', partnerLangForRematch)); } catch (pErr) {}
          await sendRatingPrompt(bot, partnerForRematch.telegram_id, ctx.session.userId, partnerLangForRematch);
          findMatchForUser(partnerForRematch.telegram_id, partnerLangForRematch).catch(err => logger.error(err, 'findMatchForUser error'));
        }
      } catch (err) { logger.error(err, 'Report chat cleanup error'); }
    }
    const text = t('report_details_prompt', lang);
    const markup = { inline_keyboard: [[{ text: t('btn_skip', lang), callback_data: 'skip_details' }]] };
    if (ctx.session.reportMsgId) {
      try { await ctx.telegram.editMessageText(ctx.chat.id, ctx.session.reportMsgId, null, text, { reply_markup: markup }); } catch (e) { await ctx.reply(text, { reply_markup: markup }); }
    } else { await ctx.reply(text, { reply_markup: markup }); }
    ctx.session.processing = false;
  });

  reportFlow.action('skip_details', async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true; await ctx.answerCbQuery();
    ctx.session.reportDetails = "";
    await submitReport(ctx);
    ctx.session.processing = false;
  });

  reportFlow.on('message', async (ctx) => {
    if (!ctx.message) return;
    if (ctx.message.text && ctx.message.text.startsWith('/')) {
      return;
    }
    // FIX Bug #28: Handle "skip" text command as alternative to the skip_details button
    if (ctx.message.text && ctx.message.text.toLowerCase() === 'skip') {
      ctx.session.reportDetails = '';
      await submitReport(ctx);
      return;
    }
    const msg = ctx.message;
    const ev = extractEvidenceFromMessage(msg);
    
    if (ev) {
      ctx.session.reportDetails = (ctx.session.reportDetails ? ctx.session.reportDetails + "\n" : "") + ev;
      const lang = ctx.session.language || 'English';
      const markup = { inline_keyboard: [[{ text: t('btn_submit_report', lang), callback_data: 'confirm_submit' }]] };
      await ctx.reply(t('evidence_added_next_or_submit', lang), { reply_markup: markup });
    }
  });

  reportFlow.action('confirm_submit', async (ctx) => {
    if (ctx.session.processing) return ctx.answerCbQuery();
    ctx.session.processing = true; await ctx.answerCbQuery();
    await submitReport(ctx);
    ctx.session.processing = false;
  });

  return reportFlow;
}

module.exports = { createReportFlow };

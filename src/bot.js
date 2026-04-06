// ✅ Load environment variables before ANY other module to ensure consistency
require('dotenv').config();

// ✅ GLOBAL UNHANDLED ERROR PROTECTION: Mencegah process crash total
const logger = require('./utils/logger');
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise: String(promise) }, 'Unhandled Rejection caught (process protected)');
});

process.on('uncaughtException', (err) => {
  logger.error(err, 'Uncaught Exception caught (process protected)');
});

const { Telegraf, Scenes } = require('telegraf');
const http = require('http');
const { db, initDB } = require('./database');
const { t } = require('./locales');
const { createReport, incrementReportCount } = require('./services/reportService');
const { getUserByTelegramId } = require('./services/userService');

if (!process.env.BOT_TOKEN) {
  logger.fatal('CRITICAL ERROR: BOT_TOKEN is not defined in .env file!');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// Services
const { housekeeping } = require('./services/housekeeping');
const { findMatchForUser, sendRatingPrompt } = require('./services/matchmaking');

// Middleware
const { createSessionMiddleware } = require('./middleware/session');
const { createCommandSceneGuard } = require('./middleware/guards');

// Scenes (with dependency injection)
const { createProfileSetupScene } = require('./scenes/profileSetup');
const { createSettingsAgeScene } = require('./scenes/settingsAge');
const { createReportFlow } = require('./scenes/reportFlow');

// Handlers
const { registerStartCommand } = require('./handlers/commands/start');
const { registerSettingsCommand } = require('./handlers/commands/settings');
const { registerFindCommand } = require('./handlers/commands/find');
const { registerReportCommand } = require('./handlers/commands/report');
const { registerStopCommand } = require('./handlers/commands/stop');
const { registerSettingsActions } = require('./handlers/actions/settings');
const { registerRatingAction } = require('./handlers/actions/rating');
const { registerMessageHandler } = require('./handlers/message');

// Bind bot-dependent services so handlers can use them without needing the bot instance
const boundFindMatch = (telegramId, userLang, depth) => findMatchForUser(bot, telegramId, userLang, depth);
const boundSendRating = (telegramId, ratedId, lang) => sendRatingPrompt(bot, telegramId, ratedId, lang);

// Create scenes with dependency injection
const profileSetup = createProfileSetupScene(boundFindMatch);
const settingsAgeScene = createSettingsAgeScene();
const reportFlow = createReportFlow(bot, boundFindMatch, async (ctx) => {
   const lang = ctx.session.language || 'English';
   const reason = ctx.session.reportReason || 'Other';
   let details = ctx.session.reportDetails || null;
   if (ctx.session.attachedEvidence) details = (details ? details + "\n---\n" : "") + ctx.session.attachedEvidence;
   try {
     const user = await getUserByTelegramId(ctx.from.id);
     if (user && ctx.session.reportedId) {
       const { createReport, incrementReportCount } = require('./services/reportService');
       await createReport(user.id, ctx.session.reportedId, reason, details);
       const repUser = await incrementReportCount(ctx.session.reportedId, reason);
       await ctx.reply(t('report_submitted', lang));
       await boundSendRating(ctx.from.id, ctx.session.reportedId, lang);
       if (repUser && repUser.report_count % 3 === 0) {
         try {
           const { escapeMarkdown } = require('./utils/markdown');
           const safeWarn = escapeMarkdown(t('auto_warn_message', repUser.language || 'English'));
           await ctx.telegram.sendMessage(repUser.telegram_id, safeWarn, { parse_mode: 'MarkdownV2' });
         } catch (w) { logger.warn(w, 'Failed to send auto-warn message'); }
       }
     } else {
       // FIX Bug #90: Don't send rating prompt if report submission failed due to missing data
       logger.warn({ userId: ctx.from.id, reportedId: ctx.session.reportedId }, 'Report submission skipped — missing user or reportedId');
     }
   } catch (err) {
      logger.error(err, 'Submit report error');
      await ctx.reply(t('something_went_wrong', lang)).catch((err) => logger.error(err, 'Failed to send error message to user'));
   }
   ctx.session.reportDetails = null;
   ctx.session.attachedEvidence = null;
   ctx.session.reportedId = null;
   ctx.session.reportChatId = null;
   ctx.session.reportReason = null;
   // FIX Bug #47: ctx.scene.leave() may throw if scene already left (e.g., user typed a command)
   try { await ctx.scene.leave(); } catch (e) { logger.warn(e, 'Failed to leave reportFlow scene'); }
 });

const stage = new Scenes.Stage([profileSetup, reportFlow, settingsAgeScene]);

// Register middleware
bot.use(createSessionMiddleware());
bot.use(createCommandSceneGuard());
bot.use(stage.middleware());

// Register commands
registerStartCommand(bot, boundFindMatch);
registerSettingsCommand(bot);
registerFindCommand(bot, boundFindMatch, boundSendRating);
registerReportCommand(bot);
registerStopCommand(bot, boundSendRating, boundFindMatch);

// Register actions
registerSettingsActions(bot);
registerRatingAction(bot);

// Register message handler
registerMessageHandler(bot, boundFindMatch);

// Catch-all error handler
bot.catch(async (err, ctx) => {
  const metadata = {
    updateType: ctx && ctx.updateType,
    chatId: ctx && ctx.chat && ctx.chat.id,
    userId: ctx && ctx.from && ctx.from.id,
    username: ctx && ctx.from && ctx.from.username,
  };
  logger.error({ err, ...metadata }, 'Telegraf catch error');
  if (err.response && [403, 401, 400].includes(err.response.error_code)) return;
  try {
    const lang = (ctx && ctx.session && ctx.session.language) || 'English';
    if (ctx) await ctx.reply(t('something_went_wrong', lang));
  } catch (re) {
    logger.error(re, 'Error in bot.catch sender');
  }
});

// Register commands with Telegram
bot.telegram.setMyCommands([
  { command: 'start', description: 'Start the bot / Mulai bot' },
  { command: 'find', description: 'Find partner / Cari pasangan' },
  { command: 'next', description: 'Next partner / Ganti pasangan' },
  { command: 'stop', description: 'Stop chat / Berhenti' },
  { command: 'settings', description: 'Settings / Pengaturan' },
  { command: 'report', description: 'Report / Lapor' }
]).catch((err) => { logger.warn(err, 'Failed to register bot commands'); });

// Startup function
async function startBot() {
  try {
    await initDB();
    // ✅ CONSOLIDATED SERVER (SINGLE PORT)
    const IS_WEBHOOK = process.env.USE_WEBHOOK === 'true';
    const PORT = parseInt(process.env.PORT || process.env.WEBHOOK_PORT || '3000', 10);
    const WEBHOOK_PATH = process.env.WEBHOOK_PATH || `/telegraf/${bot.token}`;

    if (IS_WEBHOOK) {
      const domain = process.env.WEBHOOK_DOMAIN;
      if (!domain) {
        logger.fatal('WEBHOOK_DOMAIN is required when USE_WEBHOOK=true');
        process.exit(1);
      }
      await bot.telegram.setWebhook(`https://${domain.replace(/^https?:\/\//i, '')}${WEBHOOK_PATH}`);
      logger.info({ domain, path: WEBHOOK_PATH }, 'Webhook set successfully.');
    } else {
      await bot.launch();
      logger.info('Bot started using Long Polling.');
    }

    // ✅ Fix L1: Initial housekeeping should be non-fatal to bot startup
    housekeeping().catch(e => logger.error(e, 'Initial housekeeping job failed (non-fatal)'));
    
    const hkInterval = setInterval(async () => {
      try {
        await housekeeping();
      } catch (e) {
        logger.error(e, 'Housekeeping job failed');
      }
    }, 12 * 60 * 60 * 1000);
    
    // Rec #2: Enhanced health check with liveness and readiness probes
    let botReady = IS_WEBHOOK; // Webhooks are ready when server listens

    const server = http.createServer(async (req, res) => {
      const url = req.url;
      logger.debug({ method: req.method, url }, 'Incoming request');

      // 1. Webhook Handler (Handle optional prefix)
      if (IS_WEBHOOK && (url === WEBHOOK_PATH || url.endsWith(WEBHOOK_PATH))) {
        return bot.webhookCallback(WEBHOOK_PATH)(req, res);
      }

      // 2. Health Monitoring (Handle optional prefix)
      const headers = { 'Content-Type': 'application/json' };
      if (url.endsWith('/health') || url.endsWith('/health/live')) {
        res.writeHead(200, headers);
        return res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), mode: IS_WEBHOOK ? 'webhook' : 'polling' }));
      } else if (url.endsWith('/health/ready')) {
        try {
          const dbCheck = await db.query('SELECT 1 as healthy');
          const dbHealthy = dbCheck.rows && dbCheck.rows.length > 0;
          if (dbHealthy) {
            res.writeHead(200, headers);
            return res.end(JSON.stringify({ status: 'ready', db: 'connected' }));
          }
          res.writeHead(503, headers);
          return res.end(JSON.stringify({ status: 'not_ready', db: 'disconnected' }));
        } catch (err) {
          res.writeHead(503, headers);
          return res.end(JSON.stringify({ status: 'error', message: err.message }));
        }
      }

      // 3. Not Found (With Debug Logging)
      logger.warn({ url, method: req.method }, '404 Not Found');
      res.writeHead(404, headers);
      res.end(JSON.stringify({ error: 'not_found', path: url }));
    });

server.listen(PORT, () => {
  logger.info(`Consolidated server running on port ${PORT}`);
  botReady = true;
});

    // FIX Bug #11: Clear housekeeping interval and await server close during shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      clearInterval(hkInterval);
      try { await bot.stop(signal); } catch (e) { logger.warn(e, 'bot.stop() error during shutdown'); }
      if (db && db.close) await db.close();
      await new Promise(resolve => server.close(resolve));
      process.exit(0);
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));

  } catch (err) {
    logger.error(err, 'Failed to start bot');
    process.exit(1);
  }
}

startBot();

module.exports = { bot, startBot };

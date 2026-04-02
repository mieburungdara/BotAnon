const { Telegraf, Scenes } = require('telegraf');
const http = require('http');
const { db, initDB } = require('./database');
const { t } = require('./locales');
const logger = require('./utils/logger');
require('dotenv').config();

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
const { registerNextCommand } = require('./handlers/commands/next');
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
  const { createReport, incrementReportCount } = require('./services/reportService');
  const { getUserByTelegramId } = require('./services/userService');
  const lang = ctx.session.language || 'English';
  const reason = ctx.session.reportReason || 'Other';
  let details = ctx.session.reportDetails || null;
  if (ctx.session.attachedEvidence) details = (details ? details + "\n---\n" : "") + ctx.session.attachedEvidence;
  try {
    const user = await getUserByTelegramId(ctx.from.id);
    if (user && ctx.session.reportedId) {
      await createReport(user.id, ctx.session.reportedId, reason, details);
      const repUser = await incrementReportCount(ctx.session.reportedId, reason);
      await ctx.reply(t('report_submitted', lang));
      await boundSendRating(ctx.from.id, ctx.session.reportedId, lang);
      if (repUser && repUser.report_count % 3 === 0) {
        try { await ctx.telegram.sendMessage(repUser.telegram_id, t('auto_warn_message', repUser.language || 'English'), { parse_mode: 'MarkdownV2' }); } catch (w) {}
      }
    }
  } catch (err) { logger.error(err, 'Submit report error'); }
  ctx.session.reportDetails = null;
  ctx.session.attachedEvidence = null;
  ctx.session.reportedId = null;
  ctx.session.reportChatId = null;
  ctx.session.reportReason = null;
  await ctx.scene.leave();
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
registerNextCommand(bot, boundFindMatch, boundSendRating);
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
    logger.info('Starting bot...');
    const lCfg = {};
    if (process.env.USE_WEBHOOK === 'true') {
      let domain = process.env.WEBHOOK_DOMAIN;
      if (!domain) {
        logger.error('WEBHOOK_DOMAIN is required when USE_WEBHOOK=true');
        process.exit(1);
      }
      domain = domain.replace(/^https?:\/\//i, '');
      lCfg.webhook = { domain, port: parseInt(process.env.WEBHOOK_PORT || '3000', 10), hookPath: process.env.WEBHOOK_PATH || `/telegraf/${bot.token}` };
    }
    await bot.launch(lCfg);
    logger.info(lCfg.webhook ? 'Running using Webhooks.' : 'Running using Long Polling.');

    await housekeeping();
    const hkInterval = setInterval(housekeeping, 12 * 60 * 60 * 1000);
    
    // Rec #2: Enhanced health check with liveness and readiness probes
    let botReady = false;
    const server = http.createServer(async (req, res) => {
      const headers = { 'Content-Type': 'application/json' };
      if (req.url === '/health' || req.url === '/health/live') {
        // Liveness: is the process alive?
        res.writeHead(200, headers);
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), pid: process.pid }));
      } else if (req.url === '/health/ready') {
        // Readiness: is the bot connected and DB accessible?
        try {
          const dbCheck = await db.query('SELECT 1 as healthy');
          const dbHealthy = dbCheck.rows && dbCheck.rows.length > 0 && dbCheck.rows[0].healthy === 1;
          if (dbHealthy && botReady) {
            res.writeHead(200, headers);
            res.end(JSON.stringify({ status: 'ready', db: 'connected', bot: 'launched' }));
          } else {
            res.writeHead(503, headers);
            res.end(JSON.stringify({ status: 'not_ready', db: dbHealthy ? 'connected' : 'disconnected', bot: botReady ? 'launched' : 'pending' }));
          }
        } catch (err) {
          res.writeHead(503, headers);
          res.end(JSON.stringify({ status: 'not_ready', db: 'error', error: err.message }));
        }
      } else { res.writeHead(404, headers); res.end(JSON.stringify({ error: 'not_found' })); }
    });
    const hPort = process.env.PORT_HEALTH || (lCfg.webhook ? (lCfg.webhook.port + 1) : 3000);
    server.listen(hPort, () => logger.info(`Health check server running on port ${hPort}`));

    // Mark bot as ready after successful launch
    botReady = true;

    // FIX Bug #11: Clear housekeeping interval and await server close during shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      clearInterval(hkInterval);
      bot.stop(signal);
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

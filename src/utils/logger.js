const pino = require('pino');
require('dotenv').config();

const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    pid: false,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // ✅ FIX Bug #95: Redact sensitive PII data from logs to prevent data leaks
  redact: {
    paths: [
      'telegram_id',
      'username',
      'first_name',
      'last_name',
      'token',
      'password',
      '*.telegram_id',
      '*.username',
      'ctx.from.id', // Telegraf specific
      'ctx.update.message.from.id'
    ],
    remove: true // Completely remove instead of masking with [REDACTED] for smaller log size
  },
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'hostname',
      translateTime: 'SYS:standard',
    },
  } : undefined,
});

module.exports = logger;

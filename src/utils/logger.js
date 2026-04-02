const pino = require('pino');
require('dotenv').config();

const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    pid: false,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
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

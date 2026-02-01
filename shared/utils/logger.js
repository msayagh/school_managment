const log4js = require('log4js');

// Configure log4js
log4js.configure({
  appenders: {
    console: { 
      type: 'console',
      layout: {
        type: 'pattern',
        pattern: '%d{yyyy-MM-dd HH:mm:ss} [%p] %c - %m'
      }
    },
    file: { 
      type: 'file', 
      filename: 'logs/app.log',
      maxLogSize: 10485760, // 10MB
      backups: 3,
      compress: true,
      layout: {
        type: 'pattern',
        pattern: '%d{yyyy-MM-dd HH:mm:ss} [%p] %c - %m'
      }
    }
  },
  categories: {
    default: { appenders: ['console', 'file'], level: process.env.LOG_LEVEL || 'info' }
  }
});

/**
 * Get a logger instance
 * @param {string} category Logger category
 * @returns {log4js.Logger} Logger instance
 */
function getLogger(category = 'default') {
  return log4js.getLogger(category);
}

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
  const logger = getLogger('request');
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl}`, {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    });
  });

  next();
}

module.exports = {
  getLogger,
  requestLogger,
  log4js
};

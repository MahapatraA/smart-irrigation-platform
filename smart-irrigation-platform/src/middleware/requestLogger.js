const morgan = require('morgan');
const logger = require('../utils/logger');

const stream = {
  write: (message) => logger.http(message.trim()),
};

const requestLogger = morgan(
  process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
  {
    stream,
    skip: () => process.env.NODE_ENV === 'test',
  }
);

module.exports = requestLogger;
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const mongoose = require('mongoose');

const routes = require('./routes/index');
const requestLogger = require('./middleware/requestLogger');
const rateLimiter = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { startMissedReadingJob } = require('./jobs/missedReadingJob');
const logger = require('./utils/logger');

function createApp() {
  const app = express();

  app.use(helmet());

  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'PATCH'],
  }));

  app.use(compression());

  app.use(requestLogger);

  app.use(rateLimiter);

  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function connectDatabase() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_irrigation';

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  logger.info('MongoDB connected', { uri: uri.replace(/\/\/.*@/, '//<credentials>@') });
}

async function start() {
  try {
    await connectDatabase();

    const app = createApp();
    const port = parseInt(process.env.PORT, 10) || 3000;

    const server = app.listen(port, () => {
      logger.info(`Server running on port ${port}`, {
        env: process.env.NODE_ENV || 'development',
      });
    });

    startMissedReadingJob();

    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down`);
      server.close(async () => {
        await mongoose.connection.close();
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { createApp, connectDatabase };
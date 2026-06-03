const cron = require('node-cron');
const SensorReading = require('../models/SensorReading');
const cache = require('../services/cacheService');
const { createMissingReadingAlert } = require('../services/alertService');
const { MISSING_READING_THRESHOLD_MS, CACHE_KEYS } = require('../utils/constants');
const logger = require('../utils/logger');

let lastRanAt = null;
let isRunning = false;

async function checkMissedReadings() {
  if (isRunning) {
    logger.debug('Missed-reading job already running — skipping this tick');
    return;
  }

  isRunning = true;
  const startedAt = Date.now();
  const threshold = new Date(Date.now() - MISSING_READING_THRESHOLD_MS);

  try {
    const sensorIds = await SensorReading.distinct('sensor_id');

    if (!sensorIds.length) {
      logger.debug('No sensors registered — nothing to check');
      return;
    }

    logger.debug('Checking missed readings', { sensor_count: sensorIds.length, threshold });

    let missedCount = 0;

    await Promise.all(
      sensorIds.map(async (sensorId) => {
        try {
          const lastSeen = await getLastSeenTimestamp(sensorId);

          if (!lastSeen || new Date(lastSeen.timestamp) < threshold) {
            missedCount++;
            await createMissingReadingAlert(
              sensorId,
              lastSeen?.farm_id || null,
              lastSeen?.zone_id || null,
              lastSeen?.timestamp || null
            );
          }
        } catch (err) {
          logger.error('Error checking sensor', { sensorId, error: err.message });
        }
      })
    );

    lastRanAt = new Date();
    const duration = Date.now() - startedAt;
    logger.info('Missed-reading check complete', {
      sensors_checked: sensorIds.length,
      missed: missedCount,
      duration_ms: duration,
    });
  } finally {
    isRunning = false;
  }
}

async function getLastSeenTimestamp(sensorId) {
  const cached = await cache.get(CACHE_KEYS.LATEST_READING(sensorId));
  if (cached) return cached;

  const reading = await SensorReading.findOne({ sensor_id: sensorId })
    .sort({ timestamp: -1 })
    .select('sensor_id farm_id zone_id timestamp')
    .lean();

  return reading || null;
}

function startMissedReadingJob() {
  if (process.env.NODE_ENV === 'test') return null;

  const task = cron.schedule('*/2 * * * *', async () => {
    try {
      await checkMissedReadings();
    } catch (err) {
      logger.error('Missed-reading job crashed', { error: err.message });
    }
  });

  logger.info('Missed-reading cron started (every 2 minutes)');
  return task;
}

function getJobStatus() {
  return { last_ran_at: lastRanAt, is_running: isRunning };
}

module.exports = { startMissedReadingJob, checkMissedReadings, getJobStatus };
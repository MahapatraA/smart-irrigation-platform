const SensorReading = require('../models/SensorReading');
const cache = require('./cacheService');
const { CACHE_KEYS, CACHE_TTL, ROLLING_WINDOWS } = require('../utils/constants');
const logger = require('../utils/logger');

async function getRollingAverage(sensorId, windowMinutes) {
  const cacheKey =
    windowMinutes === ROLLING_WINDOWS.FIVE_MIN
      ? CACHE_KEYS.ROLLING_AVG_5(sensorId)
      : CACHE_KEYS.ROLLING_AVG_15(sensorId);

  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  const result = await SensorReading.aggregate([
    {
      $match: {
        sensor_id: sensorId,
        timestamp: { $gte: since },
      },
    },
    {
      $group: {
        _id: null,
        avg_moisture: { $avg: '$soil_moisture' },
        avg_temperature: { $avg: '$temperature' },
        avg_water_flow: { $avg: '$water_flow' },
        count: { $sum: 1 },
        earliest: { $min: '$timestamp' },
        latest: { $max: '$timestamp' },
      },
    },
  ]);

  if (!result.length) {
    return null;
  }

  const avg = {
    sensor_id: sensorId,
    window_minutes: windowMinutes,
    avg_soil_moisture: round(result[0].avg_moisture),
    avg_temperature: round(result[0].avg_temperature),
    avg_water_flow: round(result[0].avg_water_flow),
    reading_count: result[0].count,
    window_start: result[0].earliest,
    window_end: result[0].latest,
    computed_at: new Date(),
  };

  await cache.set(cacheKey, avg, CACHE_TTL.ROLLING_AVG);
  return avg;
}

async function getRollingAverages(sensorId) {
  const [avg5, avg15] = await Promise.all([
    getRollingAverage(sensorId, ROLLING_WINDOWS.FIVE_MIN).catch((err) => {
      logger.warn('Failed to compute 5-min average', { sensorId, error: err.message });
      return null;
    }),
    getRollingAverage(sensorId, ROLLING_WINDOWS.FIFTEEN_MIN).catch((err) => {
      logger.warn('Failed to compute 15-min average', { sensorId, error: err.message });
      return null;
    }),
  ]);

  return { '5min': avg5, '15min': avg15 };
}

async function invalidateAverages(sensorId) {
  await Promise.all([
    cache.del(CACHE_KEYS.ROLLING_AVG_5(sensorId)),
    cache.del(CACHE_KEYS.ROLLING_AVG_15(sensorId)),
  ]);
}

function round(val, decimals = 2) {
  if (val == null) return null;
  return Math.round(val * 10 ** decimals) / 10 ** decimals;
}

module.exports = { getRollingAverage, getRollingAverages, invalidateAverages };


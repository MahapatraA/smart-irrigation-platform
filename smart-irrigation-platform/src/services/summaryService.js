const SensorReading = require('../models/SensorReading');
const Alert = require('../models/Alert');
const cache = require('./cacheService');
const { CACHE_KEYS, CACHE_TTL, ALERT_TYPES } = require('../utils/constants');
const logger = require('../utils/logger');

async function getSummary() {
  const cached = await cache.get(CACHE_KEYS.SUMMARY);
  if (cached) {
    logger.debug('Summary served from cache');
    return { ...cached, from_cache: true };
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [sensorCount, alertCounts, recentAverages] = await Promise.all([
    SensorReading.distinct('sensor_id').then((ids) => ids.length),

    Alert.aggregate([
      { $match: { acknowledged: false } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),

    SensorReading.aggregate([
      { $match: { timestamp: { $gte: oneHourAgo } } },
      {
        $group: {
          _id: null,
          avg_moisture: { $avg: '$soil_moisture' },
          avg_temperature: { $avg: '$temperature' },
          total_readings: { $sum: 1 },
        },
      },
    ]),
  ]);

  const alertsByType = alertCounts.reduce(
    (acc, { _id, count }) => {
      acc[_id.toLowerCase()] = count;
      acc.total += count;
      return acc;
    },
    { total: 0, anomaly: 0, missing_reading: 0 }
  );

  const avgs = recentAverages[0] || {};

  const summary = {
    sensor_count: sensorCount,
    alerts: alertsByType,
    last_hour: {
      avg_soil_moisture: round(avgs.avg_moisture),
      avg_temperature: round(avgs.avg_temperature),
      reading_count: avgs.total_readings || 0,
    },
    computed_at: new Date(),
    from_cache: false,
  };

  await cache.set(CACHE_KEYS.SUMMARY, summary, CACHE_TTL.SUMMARY);
  return summary;
}

function round(val, decimals = 2) {
  if (val == null) return null;
  return Math.round(val * 10 ** decimals) / 10 ** decimals;
}

module.exports = { getSummary };
const SensorReading = require('../models/SensorReading');
const cache = require('./cacheService');
const { detectAnomalies, highestSeverity } = require('./anomalyService');
const { createAnomalyAlerts } = require('./alertService');
const { invalidateAverages } = require('./averageService');
const { CACHE_KEYS, CACHE_TTL } = require('../utils/constants');
const logger = require('../utils/logger');

async function processSensorReadings(readings) {
  const results = {
    saved: 0,
    anomalies_detected: 0,
    alerts_created: 0,
    errors: [],
  };

  const chunks = chunkArray(readings, 10);

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (rawReading) => {
        try {
          await processSingleReading(rawReading, results);
        } catch (err) {
          logger.error('Failed to process reading', {
            sensor_id: rawReading.sensor_id,
            error: err.message,
          });
          results.errors.push({
            sensor_id: rawReading.sensor_id,
            error: err.message,
          });
        }
      })
    );
  }

  await cache.del(CACHE_KEYS.SUMMARY);

  return results;
}

async function processSingleReading(rawReading, results) {
  const anomalies = detectAnomalies(rawReading);
  const isAnomalous = anomalies.length > 0;

  const doc = new SensorReading({
    sensor_id: rawReading.sensor_id,
    farm_id: rawReading.farm_id || null,
    zone_id: rawReading.zone_id || null,
    timestamp: new Date(rawReading.timestamp),
    soil_moisture: rawReading.soil_moisture,
    water_flow: rawReading.water_flow,
    temperature: rawReading.temperature,
    is_anomalous: isAnomalous,
    anomaly_reasons: anomalies.map((a) => a.message),
  });

  await doc.save();
  results.saved++;

  await cache.set(
    CACHE_KEYS.LATEST_READING(rawReading.sensor_id),
    {
      sensor_id: rawReading.sensor_id,
      farm_id: rawReading.farm_id || null,
      zone_id: rawReading.zone_id || null,
      timestamp: doc.timestamp,
      last_seen_at: new Date(),
    },
    CACHE_TTL.LATEST_READING
  );

  if (isAnomalous) {
    results.anomalies_detected++;
    const alerts = await createAnomalyAlerts(rawReading, anomalies);
    results.alerts_created += alerts.length;
  }

  await invalidateAverages(rawReading.sensor_id);
}

async function getLatestReading(sensorId) {
  const cached = await cache.get(CACHE_KEYS.LATEST_READING(sensorId));
  if (cached) return cached;

  const reading = await SensorReading.findOne({ sensor_id: sensorId })
    .sort({ timestamp: -1 })
    .lean();

  return reading;
}

async function getDistinctSensorIds() {
  return SensorReading.distinct('sensor_id');
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

module.exports = { processSensorReadings, getLatestReading, getDistinctSensorIds };
const Alert = require('../models/Alert');
const cache = require('./cacheService');
const { ALERT_TYPES, ALERT_SEVERITY, CACHE_KEYS } = require('../utils/constants');
const logger = require('../utils/logger');

async function createAnomalyAlerts(reading, anomalies) {
  if (!anomalies.length) return [];

  const docs = anomalies.map((anomaly) => ({
    sensor_id: reading.sensor_id,
    farm_id: reading.farm_id || null,
    zone_id: reading.zone_id || null,
    type: ALERT_TYPES.ANOMALY,
    severity: anomaly.severity,
    message: anomaly.message,
    reading_value: anomaly.value,
    threshold: anomaly.threshold,
    field: anomaly.field,
  }));

  const created = await Alert.insertMany(docs, { ordered: false });
  logger.warn('Anomaly alerts created', {
    sensor_id: reading.sensor_id,
    count: created.length,
    fields: anomalies.map((a) => a.field),
  });

  await cache.del(CACHE_KEYS.SUMMARY);

  return created;
}

async function createMissingReadingAlert(sensorId, farmId, zoneId, lastSeenAt) {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const existing = await Alert.findOne({
    sensor_id: sensorId,
    type: ALERT_TYPES.MISSING_READING,
    resolved_at: null,
    created_at: { $gte: tenMinutesAgo },
  });

  if (existing) {
    logger.debug('Skipping duplicate missing-reading alert', { sensorId });
    return null;
  }

  const minutesSince = lastSeenAt
    ? Math.round((Date.now() - new Date(lastSeenAt).getTime()) / 60000)
    : null;

  const message = lastSeenAt
    ? `Sensor ${sensorId} has not reported for ${minutesSince} minute(s). Last seen: ${new Date(lastSeenAt).toISOString()}`
    : `Sensor ${sensorId} has never reported a reading`;

  const alert = await Alert.create({
    sensor_id: sensorId,
    farm_id: farmId || null,
    zone_id: zoneId || null,
    type: ALERT_TYPES.MISSING_READING,
    severity: ALERT_SEVERITY.HIGH,
    message,
    reading_value: null,
    threshold: null,
    field: null,
  });

  logger.warn('Missing reading alert created', { sensorId, lastSeenAt });
  await cache.del(CACHE_KEYS.SUMMARY);
  return alert;
}

async function getAlerts({
  type,
  severity,
  sensor_id,
  farm_id,
  acknowledged,
  page = 1,
  limit = 50,
} = {}) {
  const filter = {};
  if (type) filter.type = type;
  if (severity) filter.severity = severity;
  if (sensor_id) filter.sensor_id = sensor_id;
  if (farm_id) filter.farm_id = farm_id;
  if (acknowledged !== undefined) filter.acknowledged = acknowledged === 'true';

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [alerts, total] = await Promise.all([
    Alert.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean(),
    Alert.countDocuments(filter),
  ]);

  return {
    alerts,
    pagination: {
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      pages: Math.ceil(total / parseInt(limit, 10)),
    },
  };
}

async function acknowledgeAlert(alertId) {
  const alert = await Alert.findByIdAndUpdate(
    alertId,
    { acknowledged: true },
    { new: true }
  );
  return alert;
}

module.exports = {
  createAnomalyAlerts,
  createMissingReadingAlert,
  getAlerts,
  acknowledgeAlert,
};



const ANOMALY_THRESHOLDS = {
  MOISTURE_MIN: parseFloat(process.env.MOISTURE_MIN) || 5,
  MOISTURE_MAX: parseFloat(process.env.MOISTURE_MAX) || 95,
  TEMPERATURE_MIN: parseFloat(process.env.TEMPERATURE_MIN) || -10,
  TEMPERATURE_MAX: parseFloat(process.env.TEMPERATURE_MAX) || 60,
  WATER_FLOW_MIN: parseFloat(process.env.WATER_FLOW_MIN) || 0,
};

const ALERT_TYPES = {
  ANOMALY: 'ANOMALY',
  MISSING_READING: 'MISSING_READING',
};

const ALERT_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

const CACHE_KEYS = {
  SUMMARY: 'summary:global',
  LATEST_READING: (sensorId) => `sensor:latest:${sensorId}`,
  ROLLING_AVG_5: (sensorId) => `avg:5min:${sensorId}`,
  ROLLING_AVG_15: (sensorId) => `avg:15min:${sensorId}`,
};

const CACHE_TTL = {
  SUMMARY: parseInt(process.env.CACHE_TTL_SUMMARY, 10) || 60,
  LATEST_READING: parseInt(process.env.CACHE_TTL_LATEST_READING, 10) || 180,
  ROLLING_AVG: parseInt(process.env.CACHE_TTL_ROLLING_AVG, 10) || 300,
};

const MISSING_READING_THRESHOLD_MS =
  (parseInt(process.env.MISSING_READING_THRESHOLD_MINUTES, 10) || 2) * 60 * 1000;

const ROLLING_WINDOWS = {
  FIVE_MIN: 5,
  FIFTEEN_MIN: 15,
};

module.exports = {
  ANOMALY_THRESHOLDS,
  ALERT_TYPES,
  ALERT_SEVERITY,
  CACHE_KEYS,
  CACHE_TTL,
  MISSING_READING_THRESHOLD_MS,
  ROLLING_WINDOWS,
};

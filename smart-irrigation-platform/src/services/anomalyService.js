const { ANOMALY_THRESHOLDS, ALERT_SEVERITY } = require('../utils/constants');

function detectAnomalies(reading) {
  const { soil_moisture, temperature, water_flow } = reading;
  const anomalies = [];

  if (soil_moisture < ANOMALY_THRESHOLDS.MOISTURE_MIN) {
    anomalies.push({
      field: 'soil_moisture',
      value: soil_moisture,
      threshold: ANOMALY_THRESHOLDS.MOISTURE_MIN,
      direction: 'below',
      message: `Soil moisture critically low (${soil_moisture}% < ${ANOMALY_THRESHOLDS.MOISTURE_MIN}%)`,
      severity: ALERT_SEVERITY.CRITICAL,
    });
  }

  if (soil_moisture > ANOMALY_THRESHOLDS.MOISTURE_MAX) {
    anomalies.push({
      field: 'soil_moisture',
      value: soil_moisture,
      threshold: ANOMALY_THRESHOLDS.MOISTURE_MAX,
      direction: 'above',
      message: `Soil moisture critically high (${soil_moisture}% > ${ANOMALY_THRESHOLDS.MOISTURE_MAX}%)`,
      severity: ALERT_SEVERITY.HIGH,
    });
  }

  if (temperature < ANOMALY_THRESHOLDS.TEMPERATURE_MIN) {
    anomalies.push({
      field: 'temperature',
      value: temperature,
      threshold: ANOMALY_THRESHOLDS.TEMPERATURE_MIN,
      direction: 'below',
      message: `Temperature below freezing threshold (${temperature}°C < ${ANOMALY_THRESHOLDS.TEMPERATURE_MIN}°C)`,
      severity: ALERT_SEVERITY.HIGH,
    });
  }

  if (temperature > ANOMALY_THRESHOLDS.TEMPERATURE_MAX) {
    anomalies.push({
      field: 'temperature',
      value: temperature,
      threshold: ANOMALY_THRESHOLDS.TEMPERATURE_MAX,
      direction: 'above',
      message: `Temperature dangerously high (${temperature}°C > ${ANOMALY_THRESHOLDS.TEMPERATURE_MAX}°C)`,
      severity: ALERT_SEVERITY.HIGH,
    });
  }

  if (water_flow < ANOMALY_THRESHOLDS.WATER_FLOW_MIN) {
    anomalies.push({
      field: 'water_flow',
      value: water_flow,
      threshold: ANOMALY_THRESHOLDS.WATER_FLOW_MIN,
      direction: 'below',
      message: `Negative water flow detected (${water_flow} L/min) — possible sensor fault or backflow`,
      severity: ALERT_SEVERITY.MEDIUM,
    });
  }

  return anomalies;
}

function highestSeverity(anomalies) {
  const order = [
    ALERT_SEVERITY.LOW,
    ALERT_SEVERITY.MEDIUM,
    ALERT_SEVERITY.HIGH,
    ALERT_SEVERITY.CRITICAL,
  ];
  return anomalies.reduce((worst, a) => {
    return order.indexOf(a.severity) > order.indexOf(worst)
      ? a.severity
      : worst;
  }, ALERT_SEVERITY.LOW);
}

module.exports = { detectAnomalies, highestSeverity };
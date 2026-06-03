const { detectAnomalies, highestSeverity } = require('../../src/services/anomalyService');

process.env.MOISTURE_MIN = '5';
process.env.MOISTURE_MAX = '95';
process.env.TEMPERATURE_MIN = '-10';
process.env.TEMPERATURE_MAX = '60';
process.env.WATER_FLOW_MIN = '0';

describe('anomalyService.detectAnomalies', () => {
  const clean = {
    sensor_id: 'S1',
    soil_moisture: 40,
    temperature: 25,
    water_flow: 10,
  };

  test('returns empty array for a clean reading', () => {
    expect(detectAnomalies(clean)).toHaveLength(0);
  });

  test('flags soil_moisture below minimum', () => {
    const anomalies = detectAnomalies({ ...clean, soil_moisture: 4 });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].field).toBe('soil_moisture');
    expect(anomalies[0].direction).toBe('below');
    expect(anomalies[0].severity).toBe('CRITICAL');
  });

  test('flags soil_moisture above maximum', () => {
    const anomalies = detectAnomalies({ ...clean, soil_moisture: 96 });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].field).toBe('soil_moisture');
    expect(anomalies[0].direction).toBe('above');
  });

  test('flags temperature below minimum', () => {
    const anomalies = detectAnomalies({ ...clean, temperature: -15 });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].field).toBe('temperature');
    expect(anomalies[0].severity).toBe('HIGH');
  });

  test('flags temperature above maximum', () => {
    const anomalies = detectAnomalies({ ...clean, temperature: 65 });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].field).toBe('temperature');
  });

  test('flags negative water_flow', () => {
    const anomalies = detectAnomalies({ ...clean, water_flow: -1 });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].field).toBe('water_flow');
    expect(anomalies[0].severity).toBe('MEDIUM');
  });

  test('flags zero water_flow — boundary is exclusive (< 0)', () => {
    // water_flow = 0 is valid; only strictly negative is anomalous
    const anomalies = detectAnomalies({ ...clean, water_flow: 0 });
    expect(anomalies).toHaveLength(0);
  });

  test('detects multiple anomalies in a single reading', () => {
    const anomalies = detectAnomalies({
      ...clean,
      soil_moisture: 2,
      temperature: 70,
      water_flow: -5,
    });
    expect(anomalies).toHaveLength(3);
    const fields = anomalies.map((a) => a.field);
    expect(fields).toContain('soil_moisture');
    expect(fields).toContain('temperature');
    expect(fields).toContain('water_flow');
  });

  test('exactly at threshold boundary is not anomalous', () => {
    expect(detectAnomalies({ ...clean, soil_moisture: 5 })).toHaveLength(0);
    expect(detectAnomalies({ ...clean, soil_moisture: 95 })).toHaveLength(0);
    expect(detectAnomalies({ ...clean, temperature: -10 })).toHaveLength(0);
    expect(detectAnomalies({ ...clean, temperature: 60 })).toHaveLength(0);
  });
});

describe('anomalyService.highestSeverity', () => {
  test('returns CRITICAL when any anomaly is CRITICAL', () => {
    const anomalies = [
      { severity: 'MEDIUM' },
      { severity: 'CRITICAL' },
      { severity: 'HIGH' },
    ];
    expect(highestSeverity(anomalies)).toBe('CRITICAL');
  });

  test('returns HIGH when no CRITICAL present', () => {
    const anomalies = [{ severity: 'LOW' }, { severity: 'HIGH' }];
    expect(highestSeverity(anomalies)).toBe('HIGH');
  });

  test('returns LOW for a single low-severity anomaly', () => {
    expect(highestSeverity([{ severity: 'LOW' }])).toBe('LOW');
  });
});
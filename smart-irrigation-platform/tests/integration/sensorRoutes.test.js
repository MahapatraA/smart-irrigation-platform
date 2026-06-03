jest.mock('../../src/services/sensorService');
jest.mock('../../src/services/averageService');
jest.mock('../../src/services/cacheService', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
  isConnected: jest.fn().mockReturnValue(false),
  disconnect: jest.fn().mockResolvedValue(true),
}));

const request = require('supertest');
const { createApp } = require('../../src/app');
const sensorService = require('../../src/services/sensorService');
const averageService = require('../../src/services/averageService');

process.env.NODE_ENV = 'test';

const app = createApp();

beforeEach(() => jest.clearAllMocks());

const validPayload = [
  {
    sensor_id: 'S1',
    farm_id: 'F1',
    zone_id: 'Z1',
    timestamp: new Date().toISOString(),
    soil_moisture: 35,
    water_flow: 12,
    temperature: 27,
  },
];

describe('POST /api/v1/sensor-data', () => {
  test('201 — saves a valid reading', async () => {
    sensorService.processSensorReadings.mockResolvedValue({
      saved: 1, anomalies_detected: 0, alerts_created: 0, errors: [],
    });

    const res = await request(app)
      .post('/api/v1/sensor-data')
      .send(validPayload)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.saved).toBe(1);
  });

  test('201 — reports anomalies and alerts in response', async () => {
    sensorService.processSensorReadings.mockResolvedValue({
      saved: 1, anomalies_detected: 1, alerts_created: 1, errors: [],
    });

    const anomalousPayload = [{ ...validPayload[0], soil_moisture: 2 }];
    const res = await request(app)
      .post('/api/v1/sensor-data')
      .send(anomalousPayload)
      .expect(201);

    expect(res.body.data.anomalies_detected).toBe(1);
    expect(res.body.data.alerts_created).toBe(1);
  });

  test('400 — rejects an empty array', async () => {
    const res = await request(app)
      .post('/api/v1/sensor-data')
      .send([])
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
  });

  test('400 — rejects a non-array body', async () => {
    const res = await request(app)
      .post('/api/v1/sensor-data')
      .send({ sensor_id: 'S1' })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  test('400 — rejects missing sensor_id', async () => {
    const bad = [{ ...validPayload[0] }];
    delete bad[0].sensor_id;

    const res = await request(app)
      .post('/api/v1/sensor-data')
      .send(bad)
      .expect(400);

    expect(res.body.errors.some((e) => e.field.includes('sensor_id'))).toBe(true);
  });

  test('400 — rejects invalid timestamp format', async () => {
    const bad = [{ ...validPayload[0], timestamp: 'not-a-date' }];

    const res = await request(app)
      .post('/api/v1/sensor-data')
      .send(bad)
      .expect(400);

    expect(res.body.errors.some((e) => e.field.includes('timestamp'))).toBe(true);
  });

  test('400 — rejects soil_moisture above 100', async () => {
    const bad = [{ ...validPayload[0], soil_moisture: 110 }];

    const res = await request(app)
      .post('/api/v1/sensor-data')
      .send(bad)
      .expect(400);

    expect(res.body.errors.some((e) => e.field.includes('soil_moisture'))).toBe(true);
  });

  test('400 — rejects soil_moisture below 0', async () => {
    const bad = [{ ...validPayload[0], soil_moisture: -1 }];

    const res = await request(app)
      .post('/api/v1/sensor-data')
      .send(bad)
      .expect(400);

    expect(res.body.errors.some((e) => e.field.includes('soil_moisture'))).toBe(true);
  });

  test('400 — rejects non-numeric temperature', async () => {
    const bad = [{ ...validPayload[0], temperature: 'hot' }];

    const res = await request(app)
      .post('/api/v1/sensor-data')
      .send(bad)
      .expect(400);

    expect(res.body.errors.some((e) => e.field.includes('temperature'))).toBe(true);
  });

  test('400 — rejects missing water_flow', async () => {
    const bad = [{ ...validPayload[0] }];
    delete bad[0].water_flow;

    const res = await request(app)
      .post('/api/v1/sensor-data')
      .send(bad)
      .expect(400);

    expect(res.body.errors.some((e) => e.field.includes('water_flow'))).toBe(true);
  });

  test('422 — returns 422 when all readings fail processing', async () => {
    sensorService.processSensorReadings.mockResolvedValue({
      saved: 0, anomalies_detected: 0, alerts_created: 0,
      errors: [{ sensor_id: 'S1', error: 'DB error' }],
    });

    const res = await request(app)
      .post('/api/v1/sensor-data')
      .send(validPayload)
      .expect(422);

    expect(res.body.success).toBe(false);
  });

  test('500 — returns 500 when service throws unexpectedly', async () => {
    sensorService.processSensorReadings.mockRejectedValue(new Error('Unexpected'));

    const res = await request(app)
      .post('/api/v1/sensor-data')
      .send(validPayload)
      .expect(500);

    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/sensor-data/:sensorId/latest', () => {
  test('200 — returns the latest reading', async () => {
    sensorService.getLatestReading.mockResolvedValue({
      sensor_id: 'S1', soil_moisture: 35, temperature: 27, water_flow: 12,
    });

    const res = await request(app)
      .get('/api/v1/sensor-data/S1/latest')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.sensor_id).toBe('S1');
  });

  test('404 — returns 404 for unknown sensor', async () => {
    sensorService.getLatestReading.mockResolvedValue(null);

    await request(app)
      .get('/api/v1/sensor-data/GHOST/latest')
      .expect(404);
  });
});

describe('GET /api/v1/sensor-data/:sensorId/averages', () => {
  test('200 — returns both rolling average windows', async () => {
    averageService.getRollingAverages.mockResolvedValue({
      '5min': { sensor_id: 'S1', avg_soil_moisture: 35, reading_count: 5 },
      '15min': { sensor_id: 'S1', avg_soil_moisture: 34, reading_count: 15 },
    });

    const res = await request(app)
      .get('/api/v1/sensor-data/S1/averages')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('5min');
    expect(res.body.data).toHaveProperty('15min');
  });

  test('404 — returns 404 when both windows are null', async () => {
    averageService.getRollingAverages.mockResolvedValue({ '5min': null, '15min': null });

    await request(app)
      .get('/api/v1/sensor-data/GHOST/averages')
      .expect(404);
  });
});

describe('GET /api/v1/health', () => {
  test('200 — returns ok', async () => {
    const res = await request(app).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('uptime');
  });
});

describe('Unknown routes', () => {
  test('404 — returns structured error for unknown route', async () => {
    const res = await request(app).get('/api/v1/doesnotexist').expect(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('not found');
  });
});
jest.mock('../../src/services/alertService');
jest.mock('../../src/services/summaryService');
jest.mock('../../src/services/cacheService', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
  isConnected: jest.fn().mockReturnValue(false),
  disconnect: jest.fn().mockResolvedValue(true),
}));

const request = require('supertest');
const { createApp } = require('../../src/app');
const alertService = require('../../src/services/alertService');
const summaryService = require('../../src/services/summaryService');

process.env.NODE_ENV = 'test';

const app = createApp();

beforeEach(() => jest.clearAllMocks());

const mockAlerts = [
  { _id: 'a1', sensor_id: 'S1', type: 'ANOMALY', severity: 'CRITICAL', acknowledged: false },
  { _id: 'a2', sensor_id: 'S2', type: 'MISSING_READING', severity: 'HIGH', acknowledged: false },
];

const mockPagination = { total: 2, page: 1, limit: 50, pages: 1 };


describe('GET /api/v1/alerts', () => {
  test('200 — returns alerts and pagination', async () => {
    alertService.getAlerts.mockResolvedValue({ alerts: mockAlerts, pagination: mockPagination });

    const res = await request(app).get('/api/v1/alerts').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.alerts).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
  });

  test('200 — passes query params to getAlerts', async () => {
    alertService.getAlerts.mockResolvedValue({ alerts: [], pagination: { total: 0, page: 1, limit: 50, pages: 0 } });

    await request(app)
      .get('/api/v1/alerts?type=ANOMALY&severity=CRITICAL&sensor_id=S1&acknowledged=false')
      .expect(200);

    expect(alertService.getAlerts).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ANOMALY',
        severity: 'CRITICAL',
        sensor_id: 'S1',
        acknowledged: 'false',
      })
    );
  });

  test('200 — passes pagination params to getAlerts', async () => {
    alertService.getAlerts.mockResolvedValue({ alerts: [], pagination: { total: 0, page: 2, limit: 10, pages: 0 } });

    await request(app).get('/api/v1/alerts?page=2&limit=10').expect(200);

    expect(alertService.getAlerts).toHaveBeenCalledWith(
      expect.objectContaining({ page: '2', limit: '10' })
    );
  });

  test('200 — returns empty array when no alerts exist', async () => {
    alertService.getAlerts.mockResolvedValue({ alerts: [], pagination: { total: 0, page: 1, limit: 50, pages: 0 } });

    const res = await request(app).get('/api/v1/alerts').expect(200);
    expect(res.body.alerts).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  test('500 — returns 500 on service error', async () => {
    alertService.getAlerts.mockRejectedValue(new Error('DB failure'));

    const res = await request(app).get('/api/v1/alerts').expect(500);
    expect(res.body.success).toBe(false);
  });
});

describe('PATCH /api/v1/alerts/:alertId/acknowledge', () => {
  test('200 — acknowledges an alert', async () => {
    alertService.acknowledgeAlert.mockResolvedValue({ _id: 'a1', acknowledged: true });

    const res = await request(app)
      .patch('/api/v1/alerts/a1/acknowledge')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.acknowledged).toBe(true);
    expect(alertService.acknowledgeAlert).toHaveBeenCalledWith('a1');
  });

  test('404 — returns 404 when alert not found', async () => {
    alertService.acknowledgeAlert.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/v1/alerts/nonexistent/acknowledge')
      .expect(404);

    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/summary', () => {
  const mockSummary = {
    sensor_count: 7,
    alerts: { total: 4, anomaly: 3, missing_reading: 1 },
    last_hour: { avg_soil_moisture: 32.4, avg_temperature: 28.6, reading_count: 427 },
    computed_at: new Date(),
    from_cache: false,
  };

  test('200 — returns full summary structure', async () => {
    summaryService.getSummary.mockResolvedValue(mockSummary);

    const res = await request(app).get('/api/v1/summary').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('sensor_count', 7);
    expect(res.body.data).toHaveProperty('alerts');
    expect(res.body.data).toHaveProperty('last_hour');
    expect(res.body.data.alerts.total).toBe(4);
  });

  test('200 — returns from_cache flag when served from cache', async () => {
    summaryService.getSummary.mockResolvedValue({ ...mockSummary, from_cache: true });

    const res = await request(app).get('/api/v1/summary').expect(200);
    expect(res.body.data.from_cache).toBe(true);
  });

  test('500 — returns 500 on service error', async () => {
    summaryService.getSummary.mockRejectedValue(new Error('Aggregation failed'));

    const res = await request(app).get('/api/v1/summary').expect(500);
    expect(res.body.success).toBe(false);
  });
});
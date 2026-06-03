jest.mock('../../src/models/SensorReading');
jest.mock('../../src/services/cacheService', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
}));

const SensorReading = require('../../src/models/SensorReading');
const cache = require('../../src/services/cacheService');
const { getRollingAverage, getRollingAverages, invalidateAverages } = require('../../src/services/averageService');

beforeEach(() => {
  jest.clearAllMocks();
  cache.get.mockResolvedValue(null);
});

describe('averageService.getRollingAverage', () => {
  test('returns null when aggregation returns empty array', async () => {
    SensorReading.aggregate = jest.fn().mockResolvedValue([]);
    const result = await getRollingAverage('S_EMPTY', 5);
    expect(result).toBeNull();
  });

  test('returns cached value without hitting MongoDB', async () => {
    const cached = { sensor_id: 'S1', avg_soil_moisture: 30, window_minutes: 5 };
    cache.get.mockResolvedValueOnce(cached);
    SensorReading.aggregate = jest.fn();

    const result = await getRollingAverage('S1', 5);
    expect(result).toEqual(cached);
    expect(SensorReading.aggregate).not.toHaveBeenCalled();
  });

  test('correctly shapes aggregation result into response object', async () => {
    SensorReading.aggregate = jest.fn().mockResolvedValue([{
      avg_moisture: 40,
      avg_temperature: 25,
      avg_water_flow: 10,
      count: 5,
      earliest: new Date('2026-05-01T10:00:00Z'),
      latest: new Date('2026-05-01T10:04:00Z'),
    }]);

    const result = await getRollingAverage('S1', 5);

    expect(result.sensor_id).toBe('S1');
    expect(result.window_minutes).toBe(5);
    expect(result.avg_soil_moisture).toBe(40);
    expect(result.avg_temperature).toBe(25);
    expect(result.avg_water_flow).toBe(10);
    expect(result.reading_count).toBe(5);
  });

  test('rounds values to 2 decimal places', async () => {
    SensorReading.aggregate = jest.fn().mockResolvedValue([{
      avg_moisture: 33.3333333,
      avg_temperature: 24.6666666,
      avg_water_flow: 10.1111111,
      count: 3,
      earliest: new Date(),
      latest: new Date(),
    }]);

    const result = await getRollingAverage('S1', 5);
    expect(result.avg_soil_moisture).toBe(33.33);
    expect(result.avg_temperature).toBe(24.67);
    expect(result.avg_water_flow).toBe(10.11);
  });

  test('caches the result after a successful aggregation', async () => {
    SensorReading.aggregate = jest.fn().mockResolvedValue([{
      avg_moisture: 30, avg_temperature: 25, avg_water_flow: 10,
      count: 3, earliest: new Date(), latest: new Date(),
    }]);

    await getRollingAverage('S1', 5);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  test('passes the correct time window to the aggregation', async () => {
    SensorReading.aggregate = jest.fn().mockResolvedValue([]);

    await getRollingAverage('S1', 15);

    const pipeline = SensorReading.aggregate.mock.calls[0][0];
    const matchStage = pipeline[0].$match;
    const windowMs = Date.now() - matchStage.timestamp.$gte.getTime();
    // Should be approximately 15 minutes (allow 2s tolerance)
    expect(windowMs).toBeGreaterThan(14 * 60 * 1000);
    expect(windowMs).toBeLessThan(16 * 60 * 1000);
  });
});

describe('averageService.getRollingAverages', () => {
  test('returns both 5min and 15min keys', async () => {
    SensorReading.aggregate = jest.fn().mockResolvedValue([{
      avg_moisture: 30, avg_temperature: 25, avg_water_flow: 10,
      count: 3, earliest: new Date(), latest: new Date(),
    }]);

    const result = await getRollingAverages('S1');
    expect(result).toHaveProperty('5min');
    expect(result).toHaveProperty('15min');
  });

  test('returns null for both windows when no data', async () => {
    SensorReading.aggregate = jest.fn().mockResolvedValue([]);

    const result = await getRollingAverages('S_NONE');
    expect(result['5min']).toBeNull();
    expect(result['15min']).toBeNull();
  });
});

describe('averageService.invalidateAverages', () => {
  test('deletes both cache keys for the sensor', async () => {
    await invalidateAverages('S1');
    expect(cache.del).toHaveBeenCalledTimes(2);
    const keys = cache.del.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => k.includes('5min'))).toBe(true);
    expect(keys.some((k) => k.includes('15min'))).toBe(true);
  });
});
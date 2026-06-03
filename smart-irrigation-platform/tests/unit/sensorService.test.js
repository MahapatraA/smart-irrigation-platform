jest.mock('../../src/models/SensorReading');
jest.mock('../../src/models/Alert');
jest.mock('../../src/services/cacheService', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../src/services/alertService', () => ({
  createAnomalyAlerts: jest.fn().mockResolvedValue([{ _id: 'alert1' }]),
}));
jest.mock('../../src/services/averageService', () => ({
  invalidateAverages: jest.fn().mockResolvedValue(true),
}));

const SensorReading = require('../../src/models/SensorReading');
const cache = require('../../src/services/cacheService');
const { createAnomalyAlerts } = require('../../src/services/alertService');
const { processSensorReadings, getLatestReading, getDistinctSensorIds } = require('../../src/services/sensorService');

const mockSave = jest.fn().mockResolvedValue(true);
SensorReading.mockImplementation((data) => ({ ...data, save: mockSave }));
SensorReading.findOne = jest.fn();
SensorReading.distinct = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  cache.get.mockResolvedValue(null);
  mockSave.mockResolvedValue(true);
  createAnomalyAlerts.mockResolvedValue([{ _id: 'alert1' }]);
});

const validReading = {
  sensor_id: 'S1',
  farm_id: 'F1',
  zone_id: 'Z1',
  timestamp: new Date().toISOString(),
  soil_moisture: 40,
  temperature: 25,
  water_flow: 10,
};

describe('sensorService.processSensorReadings', () => {
  test('saves a clean reading — no anomalies, no alerts', async () => {
    const result = await processSensorReadings([validReading]);

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(result.saved).toBe(1);
    expect(result.anomalies_detected).toBe(0);
    expect(result.alerts_created).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(createAnomalyAlerts).not.toHaveBeenCalled();
  });

  test('saves multiple readings', async () => {
    const readings = [
      { ...validReading, sensor_id: 'S1' },
      { ...validReading, sensor_id: 'S2' },
      { ...validReading, sensor_id: 'S3' },
    ];

    const result = await processSensorReadings(readings);
    expect(result.saved).toBe(3);
    expect(mockSave).toHaveBeenCalledTimes(3);
  });

  test('detects anomaly for moisture below threshold and calls createAnomalyAlerts', async () => {
    const reading = { ...validReading, soil_moisture: 2 };
    const result = await processSensorReadings([reading]);

    expect(result.anomalies_detected).toBe(1);
    expect(createAnomalyAlerts).toHaveBeenCalledTimes(1);
    expect(result.alerts_created).toBe(1);
  });

  test('detects anomaly for temperature above threshold', async () => {
    createAnomalyAlerts.mockResolvedValue([{ _id: 'a1' }, { _id: 'a2' }]);
    const reading = { ...validReading, soil_moisture: 2, temperature: 70 };
    const result = await processSensorReadings([reading]);

    expect(result.anomalies_detected).toBe(1);
    expect(result.alerts_created).toBe(2);
  });

  test('does not call createAnomalyAlerts for clean reading', async () => {
    await processSensorReadings([validReading]);
    expect(createAnomalyAlerts).not.toHaveBeenCalled();
  });

  test('updates Redis latest-reading key on every write', async () => {
    await processSensorReadings([validReading]);
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining('S1'),
      expect.objectContaining({ sensor_id: 'S1' }),
      expect.any(Number)
    );
  });

  test('counts errors and continues processing remaining readings', async () => {
    mockSave
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(true);

    const readings = [
      { ...validReading, sensor_id: 'S1' },
      { ...validReading, sensor_id: 'S2' },
      { ...validReading, sensor_id: 'S3' },
    ];

    const result = await processSensorReadings(readings);
    expect(result.saved).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].sensor_id).toBe('S2');
  });

  test('invalidates summary cache after processing', async () => {
    await processSensorReadings([validReading]);
    const summaryDelCall = cache.del.mock.calls.find(
      (c) => c[0] === 'summary:global'
    );
    expect(summaryDelCall).toBeDefined();
  });
});

describe('sensorService.getLatestReading', () => {
  test('returns cached value without hitting MongoDB', async () => {
    const cached = { sensor_id: 'S1', timestamp: new Date() };
    cache.get.mockResolvedValueOnce(cached);

    const result = await getLatestReading('S1');
    expect(result).toEqual(cached);
    expect(SensorReading.findOne).not.toHaveBeenCalled();
  });

  test('falls back to MongoDB on cache miss', async () => {
    cache.get.mockResolvedValue(null);
    const dbResult = { sensor_id: 'S1', timestamp: new Date() };
    SensorReading.findOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(dbResult),
    });

    const result = await getLatestReading('S1');
    expect(SensorReading.findOne).toHaveBeenCalledWith({ sensor_id: 'S1' });
    expect(result).toEqual(dbResult);
  });

  test('returns null for unknown sensor', async () => {
    cache.get.mockResolvedValue(null);
    SensorReading.findOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });

    const result = await getLatestReading('GHOST');
    expect(result).toBeNull();
  });
});

describe('sensorService.getDistinctSensorIds', () => {
  test('returns distinct sensor IDs from MongoDB', async () => {
    SensorReading.distinct.mockResolvedValue(['S1', 'S2', 'S3']);
    const ids = await getDistinctSensorIds();
    expect(ids).toEqual(['S1', 'S2', 'S3']);
    expect(SensorReading.distinct).toHaveBeenCalledWith('sensor_id');
  });
});
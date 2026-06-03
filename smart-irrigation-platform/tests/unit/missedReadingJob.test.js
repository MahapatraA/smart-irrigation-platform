jest.mock('../../src/models/SensorReading');
jest.mock('../../src/models/Alert');
jest.mock('../../src/services/cacheService', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../src/services/alertService', () => ({
  createMissingReadingAlert: jest.fn().mockResolvedValue({ _id: 'alert1' }),
}));

const SensorReading = require('../../src/models/SensorReading');
const cache = require('../../src/services/cacheService');
const { createMissingReadingAlert } = require('../../src/services/alertService');
const { checkMissedReadings } = require('../../src/jobs/missedReadingJob');

// Ensure threshold env is set
process.env.MISSING_READING_THRESHOLD_MINUTES = '2';
process.env.NODE_ENV = 'test';

beforeEach(() => {
  jest.clearAllMocks();
  cache.get.mockResolvedValue(null);
});

function makeSensorEntry(sensorId, minutesAgo) {
  return {
    sensor_id: sensorId,
    farm_id: 'F1',
    zone_id: 'Z1',
    timestamp: new Date(Date.now() - minutesAgo * 60 * 1000),
  };
}

describe('missedReadingJob.checkMissedReadings', () => {
  test('does nothing when no sensors are registered', async () => {
    SensorReading.distinct = jest.fn().mockResolvedValue([]);
    await checkMissedReadings();
    expect(createMissingReadingAlert).not.toHaveBeenCalled();
  });

  test('does not alert for a sensor that reported within the threshold', async () => {
    SensorReading.distinct = jest.fn().mockResolvedValue(['S_RECENT']);
    cache.get.mockResolvedValue(makeSensorEntry('S_RECENT', 1));

    await checkMissedReadings();
    expect(createMissingReadingAlert).not.toHaveBeenCalled();
  });

  test('creates an alert for an overdue sensor', async () => {
    SensorReading.distinct = jest.fn().mockResolvedValue(['S_LATE']);
    cache.get.mockResolvedValue(makeSensorEntry('S_LATE', 10));

    await checkMissedReadings();
    expect(createMissingReadingAlert).toHaveBeenCalledWith(
      'S_LATE', 'F1', 'Z1', expect.any(Date)
    );
  });

  test('creates an alert when Redis misses and MongoDB also returns nothing (never seen)', async () => {
    SensorReading.distinct = jest.fn().mockResolvedValue(['S_GHOST']);
    cache.get.mockResolvedValue(null);
    SensorReading.findOne = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });

    await checkMissedReadings();
    expect(createMissingReadingAlert).toHaveBeenCalledWith('S_GHOST', null, null, null);
  });

  test('falls back to MongoDB when Redis misses', async () => {
    SensorReading.distinct = jest.fn().mockResolvedValue(['S_MONGO']);
    cache.get.mockResolvedValue(null);
    const dbEntry = makeSensorEntry('S_MONGO', 5);
    SensorReading.findOne = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(dbEntry),
    });

    await checkMissedReadings();
    expect(createMissingReadingAlert).toHaveBeenCalledWith(
      'S_MONGO', 'F1', 'Z1', expect.any(Date)
    );
  });

  test('checks all registered sensors in one run', async () => {
    SensorReading.distinct = jest.fn().mockResolvedValue(['SA', 'SB', 'SC']);
    cache.get.mockImplementation((key) => {
      const id = key.split(':').pop();
      return Promise.resolve(makeSensorEntry(id, 5));
    });

    await checkMissedReadings();
    expect(createMissingReadingAlert).toHaveBeenCalledTimes(3);
  });

  test('continues processing other sensors if one throws', async () => {
    SensorReading.distinct = jest.fn().mockResolvedValue(['S_OK', 'S_ERR', 'S_OK2']);
    cache.get
      .mockResolvedValueOnce(makeSensorEntry('S_OK', 5))
      .mockRejectedValueOnce(new Error('redis boom'))
      .mockResolvedValueOnce(makeSensorEntry('S_OK2', 5));

    await checkMissedReadings();
    expect(createMissingReadingAlert).toHaveBeenCalledTimes(2);
  });
});

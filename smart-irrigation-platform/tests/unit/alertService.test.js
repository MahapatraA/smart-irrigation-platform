jest.mock('../../src/models/Alert');
jest.mock('../../src/services/cacheService', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
}));

const Alert = require('../../src/models/Alert');
const cache = require('../../src/services/cacheService');
const {
  createAnomalyAlerts,
  createMissingReadingAlert,
  getAlerts,
  acknowledgeAlert,
} = require('../../src/services/alertService');

beforeEach(() => jest.clearAllMocks());

const reading = { sensor_id: 'S1', farm_id: 'F1', zone_id: 'Z1' };

const anomaly = {
  field: 'soil_moisture',
  value: 2,
  threshold: 5,
  severity: 'CRITICAL',
  message: 'Soil moisture critically low',
};

describe('alertService.createAnomalyAlerts', () => {
  test('calls insertMany with one document per anomaly', async () => {
    const fakeAlerts = [{ _id: 'a1' }];
    Alert.insertMany = jest.fn().mockResolvedValue(fakeAlerts);

    const result = await createAnomalyAlerts(reading, [anomaly]);

    expect(Alert.insertMany).toHaveBeenCalledTimes(1);
    const docs = Alert.insertMany.mock.calls[0][0];
    expect(docs).toHaveLength(1);
    expect(docs[0].type).toBe('ANOMALY');
    expect(docs[0].field).toBe('soil_moisture');
    expect(docs[0].severity).toBe('CRITICAL');
    expect(result).toHaveLength(1);
  });

  test('creates two docs for two anomalies', async () => {
    Alert.insertMany = jest.fn().mockResolvedValue([{}, {}]);
    const two = [anomaly, { ...anomaly, field: 'temperature', severity: 'HIGH' }];
    const result = await createAnomalyAlerts(reading, two);
    expect(Alert.insertMany.mock.calls[0][0]).toHaveLength(2);
    expect(result).toHaveLength(2);
  });

  test('returns empty array and skips insertMany when no anomalies', async () => {
    Alert.insertMany = jest.fn();
    const result = await createAnomalyAlerts(reading, []);
    expect(result).toHaveLength(0);
    expect(Alert.insertMany).not.toHaveBeenCalled();
  });

  test('invalidates summary cache after creating alerts', async () => {
    Alert.insertMany = jest.fn().mockResolvedValue([{}]);
    await createAnomalyAlerts(reading, [anomaly]);
    expect(cache.del).toHaveBeenCalledWith('summary:global');
  });
});

describe('alertService.createMissingReadingAlert', () => {
  test('creates a MISSING_READING alert when no duplicate exists', async () => {
    Alert.findOne = jest.fn().mockResolvedValue(null); // no duplicate
    const saved = {
      _id: 'alert1', type: 'MISSING_READING', severity: 'HIGH',
      message: 'Sensor S_MISS has not reported for 3 minute(s)',
    };
    Alert.create = jest.fn().mockResolvedValue(saved);

    const lastSeen = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const result = await createMissingReadingAlert('S_MISS', 'F1', 'Z1', lastSeen);

    expect(Alert.create).toHaveBeenCalledTimes(1);
    const doc = Alert.create.mock.calls[0][0];
    expect(doc.type).toBe('MISSING_READING');
    expect(doc.severity).toBe('HIGH');
    expect(result).toEqual(saved);
  });

  test('returns null and skips create when duplicate exists within 10 minutes', async () => {
    Alert.findOne = jest.fn().mockResolvedValue({ _id: 'existing' });
    Alert.create = jest.fn();

    const result = await createMissingReadingAlert('S_DUP', 'F1', 'Z1', new Date().toISOString());
    expect(result).toBeNull();
    expect(Alert.create).not.toHaveBeenCalled();
  });

  test('message contains "never reported" when lastSeenAt is null', async () => {
    Alert.findOne = jest.fn().mockResolvedValue(null);
    Alert.create = jest.fn().mockResolvedValue({ _id: 'a' });

    await createMissingReadingAlert('S_NEW', null, null, null);
    const doc = Alert.create.mock.calls[0][0];
    expect(doc.message).toContain('never reported');
  });
});

describe('alertService.getAlerts', () => {
  const mockAlerts = [
    { sensor_id: 'S1', type: 'ANOMALY', severity: 'CRITICAL', acknowledged: false },
    { sensor_id: 'S2', type: 'MISSING_READING', severity: 'HIGH', acknowledged: false },
  ];

  beforeEach(() => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockAlerts),
    };
    Alert.find = jest.fn().mockReturnValue(chain);
    Alert.countDocuments = jest.fn().mockResolvedValue(2);
  });

  test('returns alerts and pagination object', async () => {
    const result = await getAlerts();
    expect(result.alerts).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
    expect(result.pagination).toHaveProperty('page');
    expect(result.pagination).toHaveProperty('pages');
  });

  test('passes type filter to Alert.find', async () => {
    await getAlerts({ type: 'ANOMALY' });
    expect(Alert.find).toHaveBeenCalledWith(expect.objectContaining({ type: 'ANOMALY' }));
  });

  test('passes sensor_id filter to Alert.find', async () => {
    await getAlerts({ sensor_id: 'S1' });
    expect(Alert.find).toHaveBeenCalledWith(expect.objectContaining({ sensor_id: 'S1' }));
  });

  test('converts acknowledged string "true" to boolean', async () => {
    await getAlerts({ acknowledged: 'true' });
    expect(Alert.find).toHaveBeenCalledWith(expect.objectContaining({ acknowledged: true }));
  });
});

describe('alertService.acknowledgeAlert', () => {
  test('calls findByIdAndUpdate with acknowledged: true', async () => {
    const updated = { _id: 'a1', acknowledged: true };
    Alert.findByIdAndUpdate = jest.fn().mockResolvedValue(updated);

    const result = await acknowledgeAlert('a1');
    expect(Alert.findByIdAndUpdate).toHaveBeenCalledWith(
      'a1',
      { acknowledged: true },
      { new: true }
    );
    expect(result.acknowledged).toBe(true);
  });

  test('returns null for non-existent alert', async () => {
    Alert.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
    const result = await acknowledgeAlert('fake-id');
    expect(result).toBeNull();
  });
});

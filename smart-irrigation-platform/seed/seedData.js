require('dotenv').config();
const mongoose = require('mongoose');
const Farm = require('../src/models/Farm');
const Zone = require('../src/models/Zone');
const SensorReading = require('../src/models/SensorReading');
const Alert = require('../src/models/Alert');

const MONGO_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_irrigation';

const farms = [
  {
    name: 'Green Valley Farm',
    owner_id: 'user_001',
    location: { lat: 28.7041, lng: 77.1025 },
    total_area_ha: 40,
    zone_ids: ['zone_A', 'zone_B', 'zone_C'],
    is_active: true,
  },
  {
    name: 'Sunrise Agriculture',
    owner_id: 'user_002',
    location: { lat: 26.4499, lng: 80.3319 },
    total_area_ha: 35,
    zone_ids: ['zone_D', 'zone_E'],
    is_active: true,
  },
];

const zones = [
  { farm_id: 'farm_001', name: 'Zone A', area_ha: 5,  crop_type: 'wheat',    priority: 1, sensor_ids: ['S1', 'S2'] },
  { farm_id: 'farm_001', name: 'Zone B', area_ha: 3,  crop_type: 'corn',     priority: 3, sensor_ids: ['S3'] },
  { farm_id: 'farm_001', name: 'Zone C', area_ha: 4,  crop_type: 'soybean',  priority: 2, sensor_ids: ['S4'] },
  { farm_id: 'farm_002', name: 'Zone D', area_ha: 6,  crop_type: 'rice',     priority: 1, sensor_ids: ['S5', 'S6'] },
  { farm_id: 'farm_002', name: 'Zone E', area_ha: 5,  crop_type: 'cotton',   priority: 4, sensor_ids: ['S7'] },
];

const sensorProfiles = [
  { id: 'S1', farm_id: 'farm_001', zone_id: 'zone_A', baseMoisture: 35, baseTemp: 28 },
  { id: 'S2', farm_id: 'farm_001', zone_id: 'zone_A', baseMoisture: 38, baseTemp: 27 },
  { id: 'S3', farm_id: 'farm_001', zone_id: 'zone_B', baseMoisture: 42, baseTemp: 29 },
  { id: 'S4', farm_id: 'farm_001', zone_id: 'zone_C', baseMoisture: 30, baseTemp: 30 },
  { id: 'S5', farm_id: 'farm_002', zone_id: 'zone_D', baseMoisture: 25, baseTemp: 31 },
  { id: 'S6', farm_id: 'farm_002', zone_id: 'zone_D', baseMoisture: 22, baseTemp: 32 },
  { id: 'S7', farm_id: 'farm_002', zone_id: 'zone_E', baseMoisture: 45, baseTemp: 26 },
];


function jitter(base, range) {
  return parseFloat((base + (Math.random() * range * 2 - range)).toFixed(2));
}

function minutesAgo(n) {
  return new Date(Date.now() - n * 60 * 1000);
}

function generateReadings() {
  const readings = [];

  for (const sensor of sensorProfiles) {
    for (let minsAgo = 60; minsAgo >= 0; minsAgo--) {
      let moisture = jitter(sensor.baseMoisture, 5);
      let temp = jitter(sensor.baseTemp, 3);
      let flow = jitter(12, 4);

      const isAnomalyPoint =
        (sensor.id === 'S5' && minsAgo === 5) ||
        (sensor.id === 'S6' && minsAgo === 12) ||
        (sensor.id === 'S3' && minsAgo === 25);

      const anomaly_reasons = [];
      let is_anomalous = false;

      if (sensor.id === 'S5' && minsAgo === 5) {
        moisture = 2;
        is_anomalous = true;
        anomaly_reasons.push('Soil moisture critically low (2% < 5%)');
      } else if (sensor.id === 'S6' && minsAgo === 12) {
        temp = 65;
        is_anomalous = true;
        anomaly_reasons.push('Temperature dangerously high (65°C > 60°C)');
      } else if (sensor.id === 'S3' && minsAgo === 25) {
        flow = -3;
        is_anomalous = true;
        anomaly_reasons.push('Negative water flow detected (-3 L/min)');
      }

      readings.push({
        sensor_id: sensor.id,
        farm_id: sensor.farm_id,
        zone_id: sensor.zone_id,
        timestamp: minutesAgo(minsAgo),
        soil_moisture: Math.max(0, Math.min(100, moisture)),
        water_flow: flow,
        temperature: temp,
        is_anomalous,
        anomaly_reasons,
      });
    }
  }

  return readings;
}

function generateAlerts() {
  return [
    {
      sensor_id: 'S5',
      farm_id: 'farm_002',
      zone_id: 'zone_D',
      type: 'ANOMALY',
      severity: 'CRITICAL',
      message: 'Soil moisture critically low (2% < 5%)',
      reading_value: 2,
      threshold: 5,
      field: 'soil_moisture',
      acknowledged: false,
    },
    {
      sensor_id: 'S6',
      farm_id: 'farm_002',
      zone_id: 'zone_D',
      type: 'ANOMALY',
      severity: 'HIGH',
      message: 'Temperature dangerously high (65°C > 60°C)',
      reading_value: 65,
      threshold: 60,
      field: 'temperature',
      acknowledged: false,
    },
    {
      sensor_id: 'S3',
      farm_id: 'farm_001',
      zone_id: 'zone_B',
      type: 'ANOMALY',
      severity: 'MEDIUM',
      message: 'Negative water flow detected (-3 L/min) — possible sensor fault or backflow',
      reading_value: -3,
      threshold: 0,
      field: 'water_flow',
      acknowledged: true,
    },
    {
      sensor_id: 'S8',
      farm_id: 'farm_002',
      zone_id: 'zone_E',
      type: 'MISSING_READING',
      severity: 'HIGH',
      message: 'Sensor S8 has not reported for 15 minute(s). Last seen: ' +
        minutesAgo(15).toISOString(),
      reading_value: null,
      threshold: null,
      field: null,
      acknowledged: false,
    },
  ];
}


async function seed() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  console.log('Clearing existing data...');
  await Promise.all([
    Farm.deleteMany({}),
    Zone.deleteMany({}),
    SensorReading.deleteMany({}),
    Alert.deleteMany({}),
  ]);

  console.log('Seeding farms...');
  await Farm.insertMany(farms);
  console.log(`  ✓ ${farms.length} farms`);

  console.log('Seeding zones...');
  await Zone.insertMany(zones);
  console.log(`  ✓ ${zones.length} zones`);

  console.log('Generating sensor readings (60 min history × 7 sensors)...');
  const readings = generateReadings();
  const chunkSize = 500;
  for (let i = 0; i < readings.length; i += chunkSize) {
    await SensorReading.insertMany(readings.slice(i, i + chunkSize), { ordered: false });
  }
  console.log(`  ✓ ${readings.length} sensor readings`);

  console.log('Seeding alerts...');
  const alerts = generateAlerts();
  await Alert.insertMany(alerts);
  console.log(`  ✓ ${alerts.length} alerts`);

  console.log('\nSeed complete.');
  console.log('──────────────────────────────────────────────');
  console.log('Sensors: S1–S7 (S8 is intentionally missing)');
  console.log('Anomalies: S5 (moisture), S6 (temperature), S3 (flow)');
  console.log('Alerts: 3 ANOMALY, 1 MISSING_READING');
  console.log('──────────────────────────────────────────────');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
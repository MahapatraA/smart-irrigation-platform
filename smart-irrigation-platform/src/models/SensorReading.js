const mongoose = require('mongoose');

const sensorReadingSchema = new mongoose.Schema(
  {
    sensor_id: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    farm_id: {
      type: String,
      trim: true,
      default: null,
    },
    zone_id: {
      type: String,
      trim: true,
      default: null,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    soil_moisture: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    water_flow: {
      type: Number,
      required: true,
    },
    temperature: {
      type: Number,
      required: true,
    },
    is_anomalous: {
      type: Boolean,
      default: false,
      index: true,
    },
    anomaly_reasons: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false,
  }
);

sensorReadingSchema.index({ sensor_id: 1, timestamp: -1 });

sensorReadingSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 }
);

module.exports = mongoose.model('SensorReading', sensorReadingSchema);
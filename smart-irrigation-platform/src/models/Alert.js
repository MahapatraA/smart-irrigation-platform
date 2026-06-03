const mongoose = require('mongoose');
const { ALERT_TYPES, ALERT_SEVERITY } = require('../utils/constants');

const alertSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: Object.values(ALERT_TYPES),
      required: true,
    },
    severity: {
      type: String,
      enum: Object.values(ALERT_SEVERITY),
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    reading_value: {
      type: Number,
      default: null,
    },
    threshold: {
      type: Number,
      default: null,
    },
    field: {
      type: String,
      default: null,
    },
    acknowledged: {
      type: Boolean,
      default: false,
      index: true,
    },
    resolved_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

alertSchema.index({ farm_id: 1, created_at: -1 });
alertSchema.index({ sensor_id: 1, type: 1, created_at: -1 });

module.exports = mongoose.model('Alert', alertSchema);
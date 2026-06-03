const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema(
  {
    farm_id: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    area_ha: {
      type: Number,
      default: null,
    },
    crop_type: {
      type: String,
      trim: true,
      default: null,
    },
    priority: {
      type: Number,
      default: 5,
      min: 1,
      max: 10,
    },
    sensor_ids: {
      type: [String],
      default: [],
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

module.exports = mongoose.model('Zone', zoneSchema);
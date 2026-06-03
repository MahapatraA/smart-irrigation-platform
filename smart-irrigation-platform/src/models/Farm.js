const mongoose = require('mongoose');

const farmSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    owner_id: {
      type: String,
      trim: true,
      default: null,
    },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    total_area_ha: {
      type: Number,
      default: null,
    },
    zone_ids: {
      type: [String],
      default: [],
    },
    api_key: {
      type: String,
      trim: true,
      default: null,
      select: false,
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

module.exports = mongoose.model('Farm', farmSchema);
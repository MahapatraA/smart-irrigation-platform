const { body, validationResult } = require('express-validator');

const sensorReadingRules = [
  body()
    .isArray({ min: 1 })
    .withMessage('Request body must be a non-empty array of sensor readings'),

  body('*.sensor_id')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('sensor_id is required and must be a non-empty string'),

  body('*.timestamp')
    .isISO8601()
    .withMessage('timestamp must be a valid ISO 8601 date string'),

  body('*.soil_moisture')
    .isFloat({ min: 0, max: 100 })
    .withMessage('soil_moisture must be a number between 0 and 100'),

  body('*.water_flow')
    .isFloat()
    .withMessage('water_flow must be a number'),

  body('*.temperature')
    .isFloat()
    .withMessage('temperature must be a number'),

  // Optional fields
  body('*.farm_id')
    .optional()
    .isString()
    .trim(),

  body('*.zone_id')
    .optional()
    .isString()
    .trim(),
];

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({
        field: e.path,
        message: e.msg,
        value: e.value,
      })),
    });
  }
  next();
}

module.exports = { sensorReadingRules, handleValidationErrors };
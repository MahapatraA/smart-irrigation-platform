const { Router } = require('express');
const { ingestReadings, getLatest, getAverages } = require('../controllers/sensorController');
const { sensorReadingRules, handleValidationErrors } = require('../validators/sensorValidator');

const router = Router();

router.post(
  '/',
  sensorReadingRules,
  handleValidationErrors,
  ingestReadings
);

router.get('/:sensorId/latest', getLatest);
router.get('/:sensorId/averages', getAverages);

module.exports = router;
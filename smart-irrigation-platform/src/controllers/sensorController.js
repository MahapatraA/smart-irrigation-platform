const { processSensorReadings, getLatestReading } = require('../services/sensorService');
const { getRollingAverages } = require('../services/averageService');
const logger = require('../utils/logger');

async function ingestReadings(req, res, next) {
  try {
    const readings = req.body;
    logger.info('Sensor data received', { count: readings.length });

    const result = await processSensorReadings(readings);

    const statusCode = result.errors.length > 0 && result.saved === 0 ? 422 : 201;

    res.status(statusCode).json({
      success: statusCode === 201,
      message:
        statusCode === 201
          ? `${result.saved} reading(s) saved successfully`
          : 'All readings failed to process',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function getLatest(req, res, next) {
  try {
    const { sensorId } = req.params;
    const reading = await getLatestReading(sensorId);

    if (!reading) {
      return res.status(404).json({
        success: false,
        message: `No readings found for sensor ${sensorId}`,
      });
    }

    res.json({ success: true, data: reading });
  } catch (err) {
    next(err);
  }
}

async function getAverages(req, res, next) {
  try {
    const { sensorId } = req.params;
    const averages = await getRollingAverages(sensorId);

    if (!averages['5min'] && !averages['15min']) {
      return res.status(404).json({
        success: false,
        message: `No recent readings found for sensor ${sensorId}`,
      });
    }

    res.json({ success: true, data: averages });
  } catch (err) {
    next(err);
  }
}

module.exports = { ingestReadings, getLatest, getAverages };
const { Router } = require('express');
const sensorRoutes = require('./sensorRoutes');
const alertRoutes = require('./alertRoutes');
const summaryRoutes = require('./summaryRoutes');

const router = Router();

router.use('/sensor-data', sensorRoutes);
router.use('/alerts', alertRoutes);
router.use('/summary', summaryRoutes);

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date(),
  });
});

module.exports = router;
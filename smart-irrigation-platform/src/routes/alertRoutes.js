const { Router } = require('express');
const { listAlerts, acknowledge } = require('../controllers/alertController');

const router = Router();

router.get('/', listAlerts);
router.patch('/:alertId/acknowledge', acknowledge);

module.exports = router;
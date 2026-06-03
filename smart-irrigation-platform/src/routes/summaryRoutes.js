const { Router } = require('express');
const { summary } = require('../controllers/summaryController');

const router = Router();

router.get('/', summary);

module.exports = router;
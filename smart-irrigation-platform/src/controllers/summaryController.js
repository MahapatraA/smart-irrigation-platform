const { getSummary } = require('../services/summaryService');

async function summary(req, res, next) {
  try {
    const data = await getSummary();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { summary };
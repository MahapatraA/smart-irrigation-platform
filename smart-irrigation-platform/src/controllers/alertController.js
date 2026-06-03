const { getAlerts, acknowledgeAlert } = require('../services/alertService');
async function listAlerts(req, res, next) {
  try {
    const result = await getAlerts(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function acknowledge(req, res, next) {
  try {
    const { alertId } = req.params;
    const alert = await acknowledgeAlert(alertId);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: `Alert ${alertId} not found`,
      });
    }

    res.json({ success: true, data: alert });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAlerts, acknowledge };
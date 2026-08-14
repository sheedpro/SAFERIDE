'use strict';
const express = require('express');
const router = express.Router();
const { runOperationalSweep } = require('../services/reportService');

router.get('/sweep', async (req, res, next) => {
  try {
    const secrets = [process.env.OPERATIONS_SWEEP_SECRET, process.env.CRON_SECRET].filter(Boolean);
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!secrets.length || !secrets.includes(token)) return res.status(401).json({ error: 'Unauthorized' });
    res.json(await runOperationalSweep());
  } catch (error) { next(error); }
});
router.use((error, _req, res, _next) => { console.error('Operational sweep error:', error); res.status(500).json({ error: 'Operational sweep failed' }); });
module.exports = router;

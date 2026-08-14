'use strict';
require('dotenv').config();
const express = require('express'); const app = express();
app.use(express.urlencoded({ extended: false })); app.use(express.json());
app.use((req, res, next) => {
  // Keep the admin API private to known dashboard origins. Comma-separated
  // origins make it possible to use localhost and a deployed dashboard.
  const allowedOrigins = (process.env.ADMIN_ALLOWED_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use('/twilio', require('./routes/webhook'));
app.use('/admin/api', require('./routes/admin'));
app.use('/police/api', require('./routes/police'));
app.use('/internal/operations', require('./routes/operations'));
app.post('/webhook/police-ack', async (req,res) => { try { const expected = process.env.POLICECONNECT_WEBHOOK_SECRET; const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, ''); if (!expected || !supplied || supplied !== expected) return res.status(401).json({ error: 'Unauthorized' }); const service = require('./services/reportService'); const result = await service.updateOutcome(req.body.caseId, String(req.body.action || '').toUpperCase(), req.body.badgeId); await service.notifyReporterOutcome(result.report, result.rerouted); res.sendStatus(204); } catch (error) { console.error(error); res.status(500).json({ error: 'Unable to update report' }); } });
app.get('/health', (_req,res) => res.json({ status:'ok', timestamp:new Date().toISOString() }));
app.get('/api/routes/nearby', async (req,res) => { try { res.json(await require('./services/dispatchService').nearbyRoutes(Number(req.query.lat),Number(req.query.lng))); } catch(e) { res.status(500).json({error:e.message}); } });
if (process.env.VERCEL !== '1') { const port=process.env.PORT||3000; app.listen(port,()=>console.log(`SafeRide Bot running on port ${port}`)); }
module.exports=app;

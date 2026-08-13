'use strict';
require('dotenv').config();
const express = require('express'); const app = express();
app.use(express.urlencoded({ extended: false })); app.use(express.json());
app.use('/twilio', require('./routes/webhook'));
app.post('/webhook/police-ack', async (req,res) => { try { const report = await require('./services/reportService').updateOutcome(req.body.caseId, String(req.body.action || '').toUpperCase(), req.body.badgeId); await require('./services/twilioClient').sendText(report.reporter_phone_raw, `📋 *${report.case_id}*\n\nStatus: *${report.status.toUpperCase()}*. Thank you for helping keep the roads safe.`); res.sendStatus(204); } catch (error) { console.error(error); res.status(500).json({ error: 'Unable to update report' }); } });
app.get('/health', (_req,res) => res.json({ status:'ok', timestamp:new Date().toISOString() }));
app.get('/api/routes/nearby', async (req,res) => { try { res.json(await require('./services/dispatchService').nearbyRoutes(Number(req.query.lat),Number(req.query.lng))); } catch(e) { res.status(500).json({error:e.message}); } });
app.get('/api/reports/:caseId', async (req,res) => { const report=await require('./services/reportService').findByCase(req.params.caseId.toUpperCase()); res.status(report?200:404).json(report || {error:'Not found'}); });
if (process.env.VERCEL !== '1') { const port=process.env.PORT||3000; app.listen(port,()=>console.log(`SafeRide Bot running on port ${port}`)); }
module.exports=app;

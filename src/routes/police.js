'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { authenticateAdmin, requirePermission } = require('../middleware/adminAuth');
const { record } = require('../services/auditService');
const { updateOutcome, notifyReporterOutcome } = require('../services/reportService');

// Do not expose reporter_phone_raw, reporter_phone_hash, or private media paths
// to the police web client. The case number is the operational identifier.
const cleanCase = report => ({
  case_id: report.case_id,
  reported_at: report.reported_at,
  route_id: report.route_id,
  route_name: report.route_name,
  direction_of_travel: report.direction_of_travel,
  plate_number: report.plate_number,
  vehicle_description: report.vehicle_description,
  violation_type: report.violation_type,
  violation_detail: report.violation_detail,
  dispatched_checkpoint_id: report.dispatched_checkpoint_id,
  dispatch_target_name: report.dispatch_target_name,
  dispatch_priority: report.dispatch_priority,
  status: report.status,
  reporter_lat: report.reporter_lat,
  reporter_lng: report.reporter_lng,
  predicted_lat: report.predicted_lat,
  predicted_lng: report.predicted_lng,
  intercept_lat: report.intercept_lat,
  intercept_lng: report.intercept_lng,
  prediction_confidence: report.prediction_confidence,
  officer_action: report.officer_action,
  officer_action_at: report.officer_action_at,
  officer_badge_id: report.officer_badge_id,
  interception_attempts: report.interception_attempts || [],
  redispatch_count: report.redispatch_count || 0,
});

router.use(authenticateAdmin);
router.use(requirePermission('police:read'));

router.get('/me', (req, res) => res.json({
  id: req.admin.id,
  name: req.admin.name,
  email: req.admin.email,
  role: req.admin.role,
  stationScope: req.admin.station_scope,
}));

router.get('/overview', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('reports').select('status, dispatch_priority, reported_at')
      .in('status', ['Dispatched', 'Acknowledged', 'Escalated', 'NotSeen'])
      .order('reported_at', { ascending: false });
    if (error) throw error;
    const cases = data || [];
    res.json({
      activeCases: cases.length,
      awaitingAcknowledgement: cases.filter(item => item.status === 'Dispatched').length,
      officersOnRoute: cases.filter(item => item.status === 'Acknowledged').length,
      highPriority: cases.filter(item => item.dispatch_priority === 'HIGH').length,
    });
  } catch (error) { next(error); }
});

router.get('/cases', async (req, res, next) => {
  try {
    let request = supabase.from('reports').select('*').order('reported_at', { ascending: false })
      .limit(Math.min(Number(req.query.limit) || 100, 200));
    if (req.query.status) request = request.eq('status', req.query.status);
    else request = request.in('status', ['Dispatched', 'Acknowledged', 'Escalated', 'NotSeen']);
    if (req.query.caseId) request = request.ilike('case_id', `%${req.query.caseId}%`);
    if (req.query.plate) request = request.ilike('plate_number', `%${req.query.plate}%`);
    const { data, error } = await request;
    if (error) throw error;
    res.json((data || []).map(cleanCase));
  } catch (error) { next(error); }
});

router.get('/cases/:caseId', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('reports').select('*').eq('case_id', req.params.caseId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Case not found' });
    res.json(cleanCase(data));
  } catch (error) { next(error); }
});
router.get('/cases/:caseId/messages', async (req, res, next) => { try { res.json(await require('../services/caseMessageService').list(req.params.caseId)); } catch (error) { next(error); } });
router.post('/cases/:caseId/messages', requirePermission('police:write'), async (req, res, next) => { try { const message = await require('../services/caseMessageService').send(req.params.caseId, req.admin, 'police', req.body.body); await record(req.admin, 'case-message', 'report', req.params.caseId, { after: { messageId: message.id } }); res.status(201).json(message); } catch (error) { error.statusCode ? res.status(error.statusCode).json({ error: error.message }) : next(error); } });

router.get('/routes', async (_req, res, next) => {
  try {
    const { data, error } = await supabase.from('routes').select('route_id, name, polyline, is_active').eq('is_active', true).order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (error) { next(error); }
});

router.get('/checkpoints', async (_req, res, next) => {
  try {
    const [{ data: checkpoints, error }, { data: locations, error: locationError }] = await Promise.all([
      supabase.from('checkpoints').select('checkpoint_id, name, location, route_ids, is_active, duty_officers').eq('is_active', true).order('name'),
      supabase.rpc('admin_checkpoint_locations'),
    ]);
    if (error) throw error;
    if (locationError) throw locationError;
    const locationsById = new Map((locations || []).map(item => [item.checkpoint_id, item]));
    res.json((checkpoints || []).map(item => ({
      checkpoint_id: item.checkpoint_id,
      name: item.name,
      location: item.location,
      route_ids: item.route_ids,
      on_duty_count: (item.duty_officers || []).filter(officer => officer.onDuty).length,
      ...(locationsById.get(item.checkpoint_id) || {}),
    })));
  } catch (error) { next(error); }
});

router.patch('/cases/:caseId/outcome', requirePermission('police:write'), async (req, res, next) => {
  try {
    const action = String(req.body.action || '').toUpperCase();
    const reason = String(req.body.reason || '').trim();
    if (!['ONROUTE', 'INTERCEPTED', 'NOTSEEN', 'ESCALATE'].includes(action) || !reason) {
      return res.status(422).json({ error: 'A valid action and operational note are required' });
    }
    const before = await supabase.from('reports').select('*').eq('case_id', req.params.caseId).maybeSingle();
    if (before.error) throw before.error;
    if (!before.data) return res.status(404).json({ error: 'Case not found' });
    const result = await updateOutcome(req.params.caseId, action, req.body.badgeId || req.admin.email, { reason });
    await notifyReporterOutcome(result.report, result.rerouted);
    await record(req.admin, `police-${action.toLowerCase()}`, 'report', result.report.case_id, {
      before: cleanCase(before.data), after: cleanCase(result.report), reason,
    });
    res.json({ case: cleanCase(result.report), rerouted: result.rerouted, escalationAttempts: result.escalationAttempts || [] });
  } catch (error) { next(error); }
});

router.use((error, _req, res, _next) => {
  console.error('Police API error:', error);
  res.status(500).json({ error: 'Police request failed' });
});

module.exports = router;

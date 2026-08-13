'use strict';
const supabase = require('../db/supabase');
const { selectTarget } = require('./dispatchService');
const twilio = require('./twilioClient');
function nextCaseId(sequence) { return `SR-${new Date().getFullYear()}-${String(sequence).padStart(6, '0')}`; }
async function dispatch(phone, hash, draft, status = 'Dispatched') {
  const rate = await supabase.from('reports').select('case_id', { count: 'exact', head: true }).eq('reporter_phone_hash', hash).gte('reported_at', new Date(Date.now() - 86400000).toISOString());
  if (rate.count >= 5) return { rateLimited: true };
  const target = await selectTarget(draft); const { data: seq, error: seqError } = await supabase.rpc('next_saferide_case_sequence'); if (seqError) throw seqError;
  const caseId = nextCaseId(seq); const report = { case_id: caseId, reporter_phone_hash: hash, reporter_phone_raw: phone, location: draft.location ? `POINT(${draft.location.lng} ${draft.location.lat})` : null, reporter_lat: draft.location?.lat || null, reporter_lng: draft.location?.lng || null, intercept_lat: target.targetLocation?.lat || null, intercept_lng: target.targetLocation?.lng || null, location_source: draft.locationSource || 'text-fallback', location_label: draft.locationLabel, route_id: draft.routeId || null, route_name: draft.routeName || 'Route not mapped', direction_of_travel: draft.direction || null, plate_number: draft.plateNumber || null, plate_confidence: draft.plateNumber ? 'confirmed' : 'unconfirmed', vehicle_description: draft.description || null, violation_type: draft.violationType, violation_detail: draft.violationDetail || null, media_url: draft.mediaUrl || null, dispatched_checkpoint_id: target.target?.checkpoint_id || null, dispatch_target_name: target.target?.name || 'Nearest police station', distance_ahead_km: target.distanceAheadKm || null, estimated_eta_minutes: target.etaMinutes || null, status };
  const { error } = await supabase.from('reports').insert(report); if (error) throw error;
  if (target.type === 'checkpoint') for (const officer of target.target.duty_officers.filter(x => x.onDuty)) await twilio.sendOfficerAlert(officer.whatsapp, report);
  if (process.env.POLICECONNECT_API_URL) {
    try { await fetch(`${process.env.POLICECONNECT_API_URL}/saferide-reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.POLICECONNECT_SERVICE_TOKEN}` }, body: JSON.stringify({ caseId, location: draft.location, routeName: report.route_name, directionOfTravel: report.direction_of_travel, vehicle: { plateNumber: report.plate_number, description: report.vehicle_description }, violationType: report.violation_type, dispatchedCheckpointId: report.dispatched_checkpoint_id, interceptLocation: target.targetLocation, priority: report.dispatch_priority }) }); }
    catch (error) { console.error(`PoliceConnect notification failed for ${caseId}:`, error.message); }
  }
  return { report, target };
}
async function findByCase(caseId) { const { data, error } = await supabase.from('reports').select('*').eq('case_id', caseId).maybeSingle(); if (error) throw error; return data; }
async function updateOutcome(caseId, action, badgeId) { const status = action === 'INTERCEPTED' ? 'Intercepted' : action === 'NOTSEEN' ? 'NotSeen' : 'Escalated'; const { data, error } = await supabase.from('reports').update({ status, officer_action: action, officer_action_at: new Date().toISOString(), officer_badge_id: badgeId || null }).eq('case_id', caseId).select().single(); if (error) throw error; return data; }
module.exports = { dispatch, findByCase, updateOutcome };

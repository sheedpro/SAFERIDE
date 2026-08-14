'use strict';
const supabase = require('../db/supabase');
const { predictionConfidence } = require('../utils/prediction');
const { getSettings } = require('./settingsService');
async function nearbyRoutes(lat, lng) { const { data, error } = await supabase.rpc('nearby_routes', { lat, lng, max_km: 3 }); if (error) throw error; return data || []; }
function eligibleOfficers(checkpoint, routeId) {
  return (checkpoint.duty_officers || []).filter((officer) => {
    if (!officer.onDuty) return false;
    return !officer.routeIds?.length || officer.routeIds.includes(routeId);
  });
}
async function stationForCheckpoint(checkpoint, location) {
  if (checkpoint.station_id) {
    const { data, error } = await supabase.from('stations').select('*').eq('station_id', checkpoint.station_id).eq('is_active', true).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
  return (await nearestStation(location)).target;
}
async function operationalRecipient(checkpoint, routeId, location) {
  const officers = eligibleOfficers(checkpoint, routeId);
  const station = await stationForCheckpoint(checkpoint, location);
  return { station, officer: officers[0] || null, eligibleOfficers: officers };
}
async function selectTarget(draft, options = {}) {
  if (!draft.location || !draft.routeId) return nearestStation(draft.location);
  const settings = await getSettings(); const speed = Number(settings.avg_corridor_speed_kmh);
  const { data, error } = await supabase.rpc('predicted_dispatch_checkpoint', {
    route_key: draft.routeId,
    lat: draft.location.lat,
    lng: draft.location.lng,
    travel_direction: draft.direction || 'eastbound',
    reported_at: options.reportedAt || new Date().toISOString(),
    speed_kmh: speed,
    excluded_checkpoint_ids: options.excludedCheckpointIds || []
  });
  if (error) throw error; if (!data?.length) return nearestStation(draft.location);
  const checkpoint = data[0]; const { data: full, error: fullError } = await supabase.from('checkpoints').select('*').eq('checkpoint_id', checkpoint.checkpoint_id).single(); if (fullError) throw fullError;
  const distanceKm = Number(checkpoint.distance_ahead_km.toFixed(1));
  const targetLocation = { lat: checkpoint.checkpoint_lat, lng: checkpoint.checkpoint_lng };
  const recipient = await operationalRecipient(full, draft.routeId, targetLocation);
  return {
    type: 'checkpoint', target: full, targetLocation: { lat: checkpoint.checkpoint_lat, lng: checkpoint.checkpoint_lng },
    predictedLocation: { lat: checkpoint.predicted_lat, lng: checkpoint.predicted_lng },
    minutesSinceReport: checkpoint.minutes_since_report,
    predictionConfidence: predictionConfidence(draft.locationSource, checkpoint.minutes_since_report),
    distanceAheadKm: distanceKm, etaMinutes: Math.max(1, Math.round(distanceKm / speed * 60)),
    ...recipient,
  };
}
async function nearestStation(location) { if (!location) return { type: 'station', target: null }; const { data, error } = await supabase.rpc('nearest_active_station', { lat: location.lat, lng: location.lng }); if (error) throw error; const station = data?.[0] || null; return { type: 'station', target: station, targetLocation: station ? { lat: station.station_lat, lng: station.station_lng } : null }; }
module.exports = { nearbyRoutes, selectTarget, operationalRecipient };

'use strict';
const supabase = require('../db/supabase');
const { predictionConfidence } = require('../utils/prediction');
const { getSettings } = require('./settingsService');
async function nearbyRoutes(lat, lng) { const { data, error } = await supabase.rpc('nearby_routes', { lat, lng, max_km: 3 }); if (error) throw error; return data || []; }
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
  return {
    type: 'checkpoint', target: full, targetLocation: { lat: checkpoint.checkpoint_lat, lng: checkpoint.checkpoint_lng },
    predictedLocation: { lat: checkpoint.predicted_lat, lng: checkpoint.predicted_lng },
    minutesSinceReport: checkpoint.minutes_since_report,
    predictionConfidence: predictionConfidence(draft.locationSource, checkpoint.minutes_since_report),
    distanceAheadKm: distanceKm, etaMinutes: Math.max(1, Math.round(distanceKm / speed * 60))
  };
}
async function nearestStation(location) { if (!location) return { type: 'station', target: null }; const { data, error } = await supabase.rpc('nearest_active_station', { lat: location.lat, lng: location.lng }); if (error) throw error; const station = data?.[0] || null; return { type: 'station', target: station, targetLocation: station ? { lat: station.station_lat, lng: station.station_lng } : null }; }
module.exports = { nearbyRoutes, selectTarget };

'use strict';
const supabase = require('../db/supabase');
const speed = Number(process.env.AVG_CORRIDOR_SPEED_KMH || 35);
async function nearbyRoutes(lat, lng) { const { data, error } = await supabase.rpc('nearby_routes', { lat, lng, max_km: 3 }); if (error) throw error; return data || []; }
async function selectTarget(draft) {
  if (!draft.location || !draft.routeId) return nearestStation(draft.location);
  const { data, error } = await supabase.rpc('dispatch_checkpoint', { route_key: draft.routeId, lat: draft.location.lat, lng: draft.location.lng, travel_direction: draft.direction || 'eastbound' });
  if (error) throw error; if (!data?.length) return nearestStation(draft.location);
  const checkpoint = data[0]; const { data: full, error: fullError } = await supabase.from('checkpoints').select('*').eq('checkpoint_id', checkpoint.checkpoint_id).single(); if (fullError) throw fullError;
  const distanceKm = Number(checkpoint.distance_ahead_km.toFixed(1)); return { type: 'checkpoint', target: full, targetLocation: { lat: checkpoint.checkpoint_lat, lng: checkpoint.checkpoint_lng }, distanceAheadKm: distanceKm, etaMinutes: Math.max(1, Math.round(distanceKm / speed * 60)) };
}
async function nearestStation(location) { if (!location) return { type: 'station', target: null }; const { data, error } = await supabase.rpc('nearest_active_station', { lat: location.lat, lng: location.lng }); if (error) throw error; const station = data?.[0] || null; return { type: 'station', target: station, targetLocation: station ? { lat: station.station_lat, lng: station.station_lng } : null }; }
module.exports = { nearbyRoutes, selectTarget };

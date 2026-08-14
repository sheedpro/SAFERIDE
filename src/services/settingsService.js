'use strict';
const supabase = require('../db/supabase');
let cached; let expiresAt = 0;
async function getSettings() {
  if (cached && Date.now() < expiresAt) return cached;
  const { data, error } = await supabase.from('app_settings').select('*').eq('id', 'saferide-config').maybeSingle();
  if (error) throw error;
  cached = data || { avg_corridor_speed_kmh: Number(process.env.AVG_CORRIDOR_SPEED_KMH || 35) };
  expiresAt = Date.now() + 60_000;
  return cached;
}
function invalidateSettingsCache() { cached = undefined; expiresAt = 0; }
module.exports = { getSettings, invalidateSettingsCache };

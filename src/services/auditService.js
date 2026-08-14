'use strict';
const supabase = require('../db/supabase');
async function record(actor, action, entityType, entityId, { before = null, after = null, reason = null } = {}) {
  const { error } = await supabase.from('audit_logs').insert({ actor_admin_id: actor.id, action, entity_type: entityType, entity_id: String(entityId), before_data: before, after_data: after, reason });
  if (error) throw error;
}
module.exports = { record };

'use strict';
const supabase = require('../db/supabase');
const TTL_MS = 15 * 60 * 1000;
async function getOrCreate(phoneHash) { const { data, error } = await supabase.from('sessions').select('*').eq('phone_hash', phoneHash).maybeSingle(); if (error) throw error; if (!data) { const created = await supabase.from('sessions').insert({ phone_hash: phoneHash, state: 'MAIN_MENU', session_data: {} }).select().single(); if (created.error) throw created.error; return created.data; } if (Date.now() - new Date(data.last_interaction_at).getTime() > TTL_MS) return update(phoneHash, { state: 'MAIN_MENU', session_data: {} }); return data; }
async function update(phoneHash, fields) { const { data, error } = await supabase.from('sessions').update({ ...fields, last_interaction_at: new Date().toISOString() }).eq('phone_hash', phoneHash).select().single(); if (error) throw error; return data; }
module.exports = { getOrCreate, update };

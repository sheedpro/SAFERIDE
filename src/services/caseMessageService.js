'use strict';
const supabase = require('../db/supabase');
const twilio = require('./twilioClient');
const ACTIVE = ['Dispatched', 'Acknowledged', 'Escalated', 'NotSeen'];
async function recordInboundForActiveCase(phoneHash, body, twilioSid = null) {
  if (!body?.trim()) return null;
  const { data, error } = await supabase.from('reports').select('case_id').eq('reporter_phone_hash', phoneHash).in('status', ACTIVE).order('reported_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error; if (!data) return null;
  const { data: message, error: insertError } = await supabase.from('case_messages').insert({ case_id: data.case_id, direction: 'inbound', sender_role: 'reporter', body: body.trim(), twilio_message_sid: twilioSid }).select().single();
  if (insertError) throw insertError; return message;
}
async function list(caseId) { const { data, error } = await supabase.from('case_messages').select('*').eq('case_id', caseId).order('created_at'); if (error) throw error; return data || []; }
async function send(caseId, actor, role, body) {
  const text = String(body || '').trim(); if (!text) throw new Error('Message text is required'); if (text.length > 1200) throw new Error('Message is too long');
  const { data: report, error } = await supabase.from('reports').select('case_id, reporter_phone_raw').eq('case_id', caseId).maybeSingle(); if (error) throw error; if (!report) throw new Error('Case not found');
  const sent = await twilio.sendText(report.reporter_phone_raw, text);
  const { data, error: insertError } = await supabase.from('case_messages').insert({ case_id: caseId, direction: 'outbound', sender_role: role, actor_admin_id: actor.id, body: text, twilio_message_sid: sent.sid }).select().single(); if (insertError) throw insertError; return data;
}
module.exports = { recordInboundForActiveCase, list, send };

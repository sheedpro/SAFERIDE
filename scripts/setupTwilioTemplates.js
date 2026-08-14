'use strict';
/* Creates the interactive Twilio Content Templates used by the passenger flow.
   Run once, then copy the printed SIDs to Vercel/.env. */
require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
async function list(name, body, button, items) { const template = await client.content.v1.contents.create({ friendlyName: name, language: 'en', types: { 'twilio/list-picker': { body, button, items: items.map(item => ({ id: item.id, item: item.label, ...(item.description ? { description: item.description } : {}) })) } } }); console.log(`${name}: ${template.sid}`); return template.sid; }
async function replies(name, body, actions) { const template = await client.content.v1.contents.create({ friendlyName: name, language: 'en', types: { 'twilio/quick-reply': { body, actions: actions.map(action => ({ id: action.id, title: action.title })) } } }); console.log(`${name}: ${template.sid}`); return template.sid; }
function routePickerContent() { return { friendlyName: 'SafeRide Route Picker', language: 'en', types: { 'twilio/list-picker': { body: '📍 *WHICH ROUTE ARE YOU ON?*\n\nSelect the route that matches your journey, or type another route name.', button: 'Choose route', items: [{ id: 'route_1', item: '{{1}}', description: '{{5}}' }, { id: 'route_2', item: '{{2}}', description: '{{6}}' }, { id: 'route_3', item: '{{3}}', description: '{{7}}' }, { id: 'route_4', item: '{{4}}', description: '{{8}}' }] } } }; }
async function main() {
  if (process.argv[2] === 'route-picker') {
    const template = await client.content.v1.contents.create(routePickerContent());
    console.log(`SafeRide Route Picker: ${template.sid}`);
    console.log(`\nAdd this value to Vercel or .env:\nTWILIO_TPL_ROUTE_PICKER=${template.sid}`);
    return;
  }
  if (process.argv[2] === 'update-route-picker') {
    const sid = process.env.TWILIO_TPL_ROUTE_PICKER;
    if (!sid) throw new Error('TWILIO_TPL_ROUTE_PICKER must contain the existing route-picker SID.');
    await client.content.v1.contents(sid).update(routePickerContent());
    console.log(`SafeRide Route Picker updated: ${sid}`);
    return;
  }
  if (process.argv[2] === 'officer-alert') {
    const officer = await replies('SafeRide Officer Alert', '🚨 *SAFE RIDE INTERCEPTION ALERT*\n\nCase: {{1}}\nVehicle: {{2}}\nIssue: {{3}}\nCorridor: {{4}}\nHeading: {{5}}\n\nIntercept at: {{6}}\nVehicle ETA: ~{{7}} min\n\nSelect your operational response:', [{ id: 'officer_onroute', title: 'On route' }, { id: 'officer_intercepted', title: 'Intercepted' }, { id: 'officer_notseen', title: 'Not seen' }, { id: 'officer_escalate', title: 'Escalate' }]);
    console.log(`\nAdd this value to Vercel or .env:\nTWILIO_TPL_OFFICER_ALERT=${officer}`);
    return;
  }
  if (process.argv[2] === 'remaining-interactions') {
    const media = await replies('SafeRide Evidence Option', '📷 *OPTIONAL EVIDENCE*\n\nOnly send evidence when it is safe to do so.', [{ id: 'media_add', title: 'Add photo' }, { id: 'media_skip', title: 'Skip' }]);
    const dispatched = await replies('SafeRide Report Dispatched', '✅ *REPORT DISPATCHED*\n\nCase: {{1}}\nAlerted: {{2}}', [{ id: 'case_status', title: 'Check status' }, { id: 'case_message', title: 'Message support' }, { id: 'case_menu', title: 'Main menu' }]);
    const status = await replies('SafeRide Case Status', '📋 *CASE {{1}}*\n\nStatus: {{2}}\nAlerted: {{3}}', [{ id: 'case_message', title: 'Message support' }, { id: 'case_refresh', title: 'Refresh status' }, { id: 'case_menu', title: 'Main menu' }]);
    const followUp = await replies('SafeRide Officer Follow-up', '⏱️ *CASE {{1}} FOLLOW-UP*\n\nPlease record the current outcome.', [{ id: 'officer_intercepted', title: 'Intercepted' }, { id: 'officer_notseen', title: 'Not seen' }, { id: 'officer_escalate', title: 'Escalate' }]);
    const escalation = await replies('SafeRide Escalation Alert', '⚠️ *CASE {{1}} ESCALATED*\n\nVehicle: {{2}}\nCorridor: {{3}}', [{ id: 'escalation_acknowledge', title: 'Acknowledge' }, { id: 'escalation_assign', title: 'Assign officer' }, { id: 'case_menu', title: 'Open console' }]);
    console.log(`\nAdd these values to Vercel or .env:\nTWILIO_TPL_MEDIA_OPTION=${media}\nTWILIO_TPL_REPORT_DISPATCHED=${dispatched}\nTWILIO_TPL_STATUS_RESULT=${status}\nTWILIO_TPL_OFFICER_FOLLOW_UP=${followUp}\nTWILIO_TPL_ESCALATION_ALERT=${escalation}`);
    return;
  }
  const mainMenu = await list('SafeRide Main Menu', '🚌 *SAFERIDE — PSV SAFETY REPORTING*\n\nSee something unsafe? Report it in under 2 minutes. Your identity is never shared with the driver.', 'Choose service', [{ id: 'main_report', label: 'Report this vehicle', description: 'Unsafe driving happening now' }, { id: 'main_status', label: 'Check report status', description: 'Use your SafeRide case number' }, { id: 'main_how', label: 'How this works', description: 'Learn the reporting process' }]);
  const violation = await list('SafeRide Violation Menu', '⚠️ *WHAT\'S HAPPENING?*\nPick the main issue:', 'Choose issue', [{id:'violation_dangerous',label:'Dangerous driving'},{id:'violation_speeding',label:'Overspeeding'},{id:'violation_overloading',label:'Overloading'},{id:'violation_impaired',label:'Impaired driver'},{id:'violation_unroadworthy',label:'Unroadworthy vehicle'},{id:'violation_harassment',label:'Harassment'},{id:'violation_deviation',label:'Route deviation'},{id:'violation_overcharging',label:'Overcharging'},{id:'violation_other',label:'Other'}]);
  const direction = await replies('SafeRide Direction', '🧭 *WHICH WAY ARE YOU HEADING?*', [{id:'direction_forward',title:'Towards route end'},{id:'direction_backward',title:'Towards route start'}]);
  const emergency = await replies('SafeRide Safety Check', '⚠️ *ARE YOU SAFE RIGHT NOW?*\n\nYou selected: {{1}}', [{id:'safety_help_now',title:'I need help NOW'},{id:'safety_continue',title:'I am safe, continue'}]);
  const confirm = await replies('SafeRide Confirm Report', '✅ *REVIEW YOUR REPORT*\n\n📍 Location: {{1}}\n🛣️ Route: {{2}}\n🚌 Vehicle: {{3}}\n⚠️ Issue: {{4}}', [{id:'confirm_send',title:'Confirm & Send'},{id:'confirm_edit',title:'Edit details'},{id:'confirm_cancel',title:'Cancel'}]);
  console.log('\nAdd these values to Vercel or .env:'); console.log(`TWILIO_TPL_MAIN_MENU=${mainMenu}`); console.log(`TWILIO_TPL_VIOLATION_MENU=${violation}`); console.log(`TWILIO_TPL_DIRECTION=${direction}`); console.log(`TWILIO_TPL_EMERGENCY_CHECK=${emergency}`); console.log(`TWILIO_TPL_CONFIRM_REPORT=${confirm}`);
}
main().catch(error => { console.error('Template setup failed:', error.message); process.exit(1); });

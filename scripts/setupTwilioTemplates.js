'use strict';
/* Creates the interactive Twilio Content Templates used by the passenger flow.
   Run once, then copy the printed SIDs to Vercel/.env. */
require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
async function list(name, body, button, items) { const template = await client.content.v1.contents.create({ friendlyName: name, language: 'en', types: { 'twilio/list-picker': { body, button, items: items.map(item => ({ id: item.id, item: item.label, ...(item.description ? { description: item.description } : {}) })) } } }); console.log(`${name}: ${template.sid}`); return template.sid; }
async function replies(name, body, actions) { const template = await client.content.v1.contents.create({ friendlyName: name, language: 'en', types: { 'twilio/quick-reply': { body, actions: actions.map(action => ({ id: action.id, title: action.title })) } } }); console.log(`${name}: ${template.sid}`); return template.sid; }
async function main() {
  const mainMenu = await list('SafeRide Main Menu', '🚌 *SAFERIDE — PSV SAFETY REPORTING*\n\nSee something unsafe? Report it in under 2 minutes. Your identity is never shared with the driver.', 'Choose service', [{ id: 'main_report', label: 'Report this vehicle', description: 'Unsafe driving happening now' }, { id: 'main_status', label: 'Check report status', description: 'Use your SafeRide case number' }, { id: 'main_how', label: 'How this works', description: 'Learn the reporting process' }]);
  const violation = await list('SafeRide Violation Menu', '⚠️ *WHAT\'S HAPPENING?*\nPick the main issue:', 'Choose issue', [{id:'violation_dangerous',label:'Dangerous driving'},{id:'violation_speeding',label:'Overspeeding'},{id:'violation_overloading',label:'Overloading'},{id:'violation_impaired',label:'Impaired driver'},{id:'violation_unroadworthy',label:'Unroadworthy vehicle'},{id:'violation_harassment',label:'Harassment'},{id:'violation_deviation',label:'Route deviation'},{id:'violation_overcharging',label:'Overcharging'},{id:'violation_other',label:'Other'}]);
  const direction = await replies('SafeRide Direction', '🧭 *WHICH WAY ARE YOU HEADING?*', [{id:'direction_forward',title:'Towards route end'},{id:'direction_backward',title:'Towards route start'}]);
  const emergency = await replies('SafeRide Safety Check', '⚠️ *ARE YOU SAFE RIGHT NOW?*\n\nYou selected: {{1}}', [{id:'safety_help_now',title:'I need help NOW'},{id:'safety_continue',title:'I am safe, continue'}]);
  const confirm = await replies('SafeRide Confirm Report', '✅ *REVIEW YOUR REPORT*\n\n📍 Location: {{1}}\n🛣️ Route: {{2}}\n🚌 Vehicle: {{3}}\n⚠️ Issue: {{4}}', [{id:'confirm_send',title:'Confirm & Send'},{id:'confirm_edit',title:'Edit details'},{id:'confirm_cancel',title:'Cancel'}]);
  console.log('\nAdd these values to Vercel or .env:'); console.log(`TWILIO_TPL_MAIN_MENU=${mainMenu}`); console.log(`TWILIO_TPL_VIOLATION_MENU=${violation}`); console.log(`TWILIO_TPL_DIRECTION=${direction}`); console.log(`TWILIO_TPL_EMERGENCY_CHECK=${emergency}`); console.log(`TWILIO_TPL_CONFIRM_REPORT=${confirm}`);
}
main().catch(error => { console.error('Template setup failed:', error.message); process.exit(1); });

'use strict';
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const from = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
async function sendText(phone, body) { const message = await client.messages.create({ from, to: `whatsapp:${phone}`, body }); console.log(`[WA OUT] ${phone} | ${message.sid}`); return message; }
function mapsSearch(lat, lng) { return lat == null || lng == null ? null : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`; }
function mapsNavigate(lat, lng) { return lat == null || lng == null ? null : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`; }
async function sendOfficerAlert(phone, report) { const vehiclePin = mapsSearch(report.reporter_lat, report.reporter_lng); const interceptPin = mapsNavigate(report.intercept_lat, report.intercept_lng); return sendText(phone, `🚨 *SafeRide Interception Alert — ${report.case_id}*\n\nVehicle: ${report.plate_number || report.vehicle_description}\nIssue: ${report.violation_type}\nCorridor: ${report.route_name}\nHeading: ${report.direction_of_travel}\n\n*Intercept at:* ${report.dispatch_target_name}\nDistance ahead: ~${report.distance_ahead_km || '?'} km\nVehicle ETA: ~${report.estimated_eta_minutes || '?'} min\n\n📍 Last reported vehicle location:\n${vehiclePin || 'Location provided as text only'}\n🧭 Navigate to interception point:\n${interceptPin || 'No mapped interception point'}\n\nReply *INTERCEPTED ${report.case_id}*, *NOTSEEN ${report.case_id}*, or *ESCALATE ${report.case_id}*.`); }
module.exports = { sendText, sendOfficerAlert };

"use strict";
const twilio = require("twilio");
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);
const from = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
const T = {
  mainMenu: process.env.TWILIO_TPL_MAIN_MENU,
  violationMenu: process.env.TWILIO_TPL_VIOLATION_MENU,
  direction: process.env.TWILIO_TPL_DIRECTION,
  emergencyCheck: process.env.TWILIO_TPL_EMERGENCY_CHECK,
  confirmReport: process.env.TWILIO_TPL_CONFIRM_REPORT,
  status: process.env.TWILIO_TPL_STATUS,
  officerAlert: process.env.TWILIO_TPL_OFFICER_ALERT,
  mediaOption: process.env.TWILIO_TPL_MEDIA_OPTION,
  reportDispatched: process.env.TWILIO_TPL_REPORT_DISPATCHED,
  statusResult: process.env.TWILIO_TPL_STATUS_RESULT,
  officerFollowUp: process.env.TWILIO_TPL_OFFICER_FOLLOW_UP,
  escalationAlert: process.env.TWILIO_TPL_ESCALATION_ALERT,
};
async function sendText(phone, body) {
  const message = await client.messages.create({
    from,
    to: `whatsapp:${phone}`,
    body,
  });
  console.log(`[WA OUT] ${phone} | ${message.sid}`);
  return message;
}
async function sendContent(phone, contentSid, variables = {}) {
  const message = await client.messages.create({
    from,
    to: `whatsapp:${phone}`,
    contentSid,
    ...(Object.keys(variables).length
      ? { contentVariables: JSON.stringify(variables) }
      : {}),
  });
  console.log(`[WA OUT] ${phone} | ${message.sid} | template=${contentSid}`);
  return message;
}
async function sendMainMenu(phone, fallback) {
  return T.mainMenu
    ? sendContent(phone, T.mainMenu)
    : sendText(phone, fallback);
}
async function sendViolationMenu(phone, fallback) {
  return T.violationMenu
    ? sendContent(phone, T.violationMenu)
    : sendText(phone, fallback);
}
async function sendDirectionMenu(phone, fallback) {
  return T.direction
    ? sendContent(phone, T.direction)
    : sendText(phone, fallback);
}
async function sendEmergencyCheck(phone, issue, fallback) {
  return T.emergencyCheck
    ? sendContent(phone, T.emergencyCheck, { 1: issue })
    : sendText(phone, fallback);
}
async function sendConfirmReport(phone, report, fallback) {
  return T.confirmReport
    ? sendContent(phone, T.confirmReport, {
        1: report.locationLabel || "GPS shared",
        2: report.routeName,
        3: report.plateNumber || report.description,
        4: report.violationType,
      })
    : sendText(phone, fallback);
}
function coordinates(lat, lng) {
  return lat == null || lng == null
    ? "No coordinates available"
    : `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
}
async function sendOfficerAlert(phone, report) {
  if (T.officerAlert)
    return sendContent(phone, T.officerAlert, {
      1: report.case_id,
      2: report.plate_number || report.vehicle_description || "Unknown vehicle",
      3: report.violation_type || "Not specified",
      4: report.route_name || "Unmapped route",
      5: report.direction_of_travel || "Not specified",
      6: report.dispatch_target_name || "Police checkpoint",
      7: String(report.estimated_eta_minutes || "?"),
    });
  const redispatch = report.redispatch_count
    ? `\n⚠️ Re-dispatch #${report.redispatch_count}: previous checkpoint did not see the vehicle.`
    : "";
  return sendText(
    phone,
    `🚨 *SafeRide Interception Alert — ${report.case_id}*${redispatch}\n\nVehicle: ${report.plate_number || report.vehicle_description}\nIssue: ${report.violation_type}\nCorridor: ${report.route_name}\nHeading: ${report.direction_of_travel}\n\n*Intercept at:* ${report.dispatch_target_name}\nDistance from predicted position: ~${report.distance_ahead_km || "?"} km\nVehicle ETA: ~${report.estimated_eta_minutes || "?"} min\nPrediction confidence: *${report.prediction_confidence || "LOW"}*\n\n📍 Last reported coordinates:\n${coordinates(report.reporter_lat, report.reporter_lng)}\n🔮 Predicted corridor coordinates (estimate, not live tracking):\n${coordinates(report.predicted_lat, report.predicted_lng)}\n🧭 Interception-point coordinates:\n${coordinates(report.intercept_lat, report.intercept_lng)}\n\nReply *ONROUTE ${report.case_id}*, *INTERCEPTED ${report.case_id}*, *NOTSEEN ${report.case_id}*, or *ESCALATE ${report.case_id}*.`,
  );
}
async function sendEscalationAlert(phone, report, reason) {
  return sendText(
    phone,
    `⚠️ *SafeRide Escalation — ${report.case_id}*\n\nVehicle: ${report.plate_number || report.vehicle_description || "Unknown"}\nIssue: ${report.violation_type || "Not specified"}\nCorridor: ${report.route_name || "Not mapped"}\nCurrent status: *ESCALATED*\nAssigned point: ${report.dispatch_target_name || "Station fallback"}\nReason: ${reason || "Operational escalation requested"}\n\nOpen the Police Dispatch Console and search ${report.case_id} for the protected case record.`,
  );
}
async function sendMediaOption(phone, fallback) {
  return T.mediaOption
    ? sendContent(phone, T.mediaOption)
    : sendText(phone, fallback);
}
async function sendReportDispatched(phone, report, fallback) {
  return T.reportDispatched
    ? sendContent(phone, T.reportDispatched, {
        1: report.case_id,
        2: report.dispatch_target_name || "Police",
      })
    : sendText(phone, fallback);
}
async function sendStatusResult(phone, report, fallback) {
  return T.statusResult
    ? sendContent(phone, T.statusResult, {
        1: report.case_id,
        2: report.status,
        3: report.dispatch_target_name || "Police",
      })
    : sendText(phone, fallback);
}
module.exports = {
  sendText,
  sendContent,
  sendMainMenu,
  sendViolationMenu,
  sendDirectionMenu,
  sendEmergencyCheck,
  sendConfirmReport,
  sendOfficerAlert,
  sendEscalationAlert,
  sendMediaOption,
  sendReportDispatched,
  sendStatusResult,
};

'use strict';
const EMERGENCY = '🚨 *IF YOU ARE IN IMMEDIATE DANGER*\n\nCall *999* or *112* right now.\nThis WhatsApp bot is NOT an emergency line and is not monitored every second.\n\nOnce you are safe, you can still file a report here for follow-up.\n\nReply *REPORT* to continue when safe.\nReply *MENU* to go back.';
const mainMenu = () => '🚌 *SAFERIDE — PSV SAFETY REPORTING*\n\nSee something unsafe? Report it in under 2 minutes. Your identity is never shared with the driver.\n\n1️⃣ 🚨 Report this vehicle NOW\n2️⃣ 📋 Check my report status\n3️⃣ ❓ How this works\n\n⚠️ In immediate danger? Reply *999*';
const locationPrompt = () => '📍 *SHARE YOUR LOCATION*\n\nTap the 📎 (attach) icon → *Location* → *Send your current location*\n\nI need this to find the nearest police checkpoint on your road — a report can\'t be filed without it.\n\n⚠️ Immediate danger? Reply *999*';
const violations = ['Dangerous / reckless driving','Overspeeding','Overloading passengers','Driver appears drunk / impaired','Unroadworthy vehicle','Harassment of passengers','Route deviation / dumping passengers','Overcharging','Other'];
const violationPrompt = () => `⚠️ *WHAT'S HAPPENING?*\nPick the main issue:\n\n${violations.map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
module.exports = { EMERGENCY, mainMenu, locationPrompt, violations, violationPrompt };

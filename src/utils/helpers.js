'use strict';
const crypto = require('crypto');
function normalisePhone(value) { return value.replace(/^whatsapp:/i, ''); }
function phoneHash(value) { return crypto.createHash('sha256').update(`${value}${process.env.REPORTER_PHONE_SALT || ''}`).digest('hex'); }
function formatDateTime(value) { return new Date(value).toLocaleString('en-UG', { timeZone: 'Africa/Kampala', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
module.exports = { normalisePhone, phoneHash, formatDateTime };

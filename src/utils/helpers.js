'use strict';
const crypto = require('crypto');
function normalisePhone(value) {
  const digits = String(value || '').replace(/^whatsapp:/i, '').replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) return `+256${digits.slice(1)}`;
  if (digits.startsWith('256') && digits.length === 12) return `+${digits}`;
  return digits ? `+${digits}` : '';
}
function phoneHash(value) { return crypto.createHash('sha256').update(`${value}${process.env.REPORTER_PHONE_SALT || ''}`).digest('hex'); }
function formatDateTime(value) { return new Date(value).toLocaleString('en-UG', { timeZone: 'Africa/Kampala', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
module.exports = { normalisePhone, phoneHash, formatDateTime };

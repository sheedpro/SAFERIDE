'use strict';
const crypto = require('crypto');
// Registration formats change and SafeRide can receive vehicles crossing the
// border. Keep known Ugandan formats explicit, then accept a conservative
// international alphanumeric registration rather than rejecting a report.
const validatePlate = input => {
  const plate = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!plate) return null;
  const ugandan = [
    /^U[A-Z]{2}\d{3}[A-Z]$/, // legacy private vehicle: UBH 123K
    /^UA\d{3}[A-Z]{2}$/, // digital private vehicle: UA 001AA
    /^UMA\d{3}[A-Z]{2}$/, // digital motorcycle: UMA 001AA
    /^TUA\d{3}[A-Z]{2}$/, // digital trailer: T UA 001AA
    /^UG\d{2,7}[A-Z]?$/, // government / statutory series
  ];
  if (ugandan.some(pattern => pattern.test(plate))) return plate;
  // A U-prefixed value is most likely a mistyped Ugandan registration. Do not
  // silently classify a malformed local plate as a foreign one.
  if (plate.startsWith('U')) return null;
  // Foreign plates vary by country. Require both letters and digits, and keep
  // the length bounded so ordinary conversation text is not stored as a plate.
  return /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{3,12}$/.test(plate) ? plate : null;
};
const isWithinUganda = (lat, lng) => Number(lat) >= -1.5 && Number(lat) <= 4.3 && Number(lng) >= 29.5 && Number(lng) <= 35.1;
const isCaseId = value => /^SR-\d{4}-\d{6}$/i.test(value.trim());
const phoneHash = value => crypto.createHash('sha256').update(`${value}${process.env.REPORTER_PHONE_SALT || ''}`).digest('hex');
module.exports = { validatePlate, isWithinUganda, isCaseId, phoneHash };

'use strict';
const crypto = require('crypto');
const validatePlate = input => { const plate = input.toUpperCase().replace(/\s/g, ''); return /^U[A-Z]{2}\d{3}[A-Z]$/.test(plate) ? plate : null; };
const isWithinUganda = (lat, lng) => Number(lat) >= -1.5 && Number(lat) <= 4.3 && Number(lng) >= 29.5 && Number(lng) <= 35.1;
const isCaseId = value => /^SR-\d{4}-\d{6}$/i.test(value.trim());
const phoneHash = value => crypto.createHash('sha256').update(`${value}${process.env.REPORTER_PHONE_SALT || ''}`).digest('hex');
module.exports = { validatePlate, isWithinUganda, isCaseId, phoneHash };

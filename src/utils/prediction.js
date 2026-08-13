'use strict';
function predictionConfidence(locationSource, minutesSinceReport) {
  if (locationSource !== 'gps-pin') return 'LOW';
  if (minutesSinceReport <= 5) return 'HIGH';
  if (minutesSinceReport <= 15) return 'MEDIUM';
  return 'LOW';
}
module.exports = { predictionConfidence };

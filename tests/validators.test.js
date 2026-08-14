'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const {validatePlate,isWithinUganda,isCaseId}=require('../src/utils/validators');
const { predictionConfidence } = require('../src/utils/prediction');
test('normalises valid Ugandan plate numbers',()=>assert.equal(validatePlate('ubh 123k'),'UBH123K'));
test('accepts current Ugandan digital vehicle, motorcycle, and trailer plates',()=>{ assert.equal(validatePlate('ua 001aa'),'UA001AA'); assert.equal(validatePlate('uma 001aa'),'UMA001AA'); assert.equal(validatePlate('t ua 001aa'),'TUA001AA'); });
test('accepts foreign registrations while rejecting ordinary text',()=>{ assert.equal(validatePlate('KDA 123A'),'KDA123A'); assert.equal(validatePlate('r 1234 abc'),'R1234ABC'); assert.equal(validatePlate('vehicle'),null); assert.equal(validatePlate('UBH12K'),null); });
test('validates Uganda GPS bounding box',()=>{assert.equal(isWithinUganda(0.35,32.65),true);assert.equal(isWithinUganda(-4,32.65),false);});
test('validates SafeRide case IDs',()=>{assert.equal(isCaseId('SR-2026-004521'),true);assert.equal(isCaseId('SR-26-1'),false);});
test('uses prediction confidence that reflects location quality and report age',()=>{assert.equal(predictionConfidence('gps-pin', 3),'HIGH');assert.equal(predictionConfidence('gps-pin', 10),'MEDIUM');assert.equal(predictionConfidence('gps-pin', 16),'LOW');assert.equal(predictionConfidence('text-fallback', 1),'LOW');});

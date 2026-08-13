'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const {validatePlate,isWithinUganda,isCaseId}=require('../src/utils/validators');
const { predictionConfidence } = require('../src/utils/prediction');
test('normalises valid Ugandan plate numbers',()=>assert.equal(validatePlate('ubh 123k'),'UBH123K'));
test('rejects invalid plate numbers',()=>assert.equal(validatePlate('UBH12K'),null));
test('validates Uganda GPS bounding box',()=>{assert.equal(isWithinUganda(0.35,32.65),true);assert.equal(isWithinUganda(-4,32.65),false);});
test('validates SafeRide case IDs',()=>{assert.equal(isCaseId('SR-2026-004521'),true);assert.equal(isCaseId('SR-26-1'),false);});
test('uses prediction confidence that reflects location quality and report age',()=>{assert.equal(predictionConfidence('gps-pin', 3),'HIGH');assert.equal(predictionConfidence('gps-pin', 10),'MEDIUM');assert.equal(predictionConfidence('gps-pin', 16),'LOW');assert.equal(predictionConfidence('text-fallback', 1),'LOW');});

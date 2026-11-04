import test from 'node:test';
import assert from 'node:assert/strict';
import {ARCHAEOLOGY_STUDIES, normalizeArchaeologyCareer, transitionArchaeologyCareer, validateArchaeologyCareerBackup, archaeologyCareerBadge} from '../app/js/campaign/archaeology-career.js';
import {normalizeResearchCareers, researchCareerDefinition} from '../app/js/campaign/research-career-definitions.js';
import {studyHarness} from './helpers/archaeology-study.mjs';
import {createDefaultCharacterState} from '../app/js/character/model.js';
import {projectCharacterProgress} from '../app/js/character/progression.js';

test('a find cannot bypass its stratigraphy, context or packing record', () => {
  const h = studyHarness(); h.survey();
  assert.throws(() => h.step('collect', {packing: 'labelled-box'}), /Record the exposed context/);
  assert.throws(() => h.step('excavate', {tool: 'brush'}), /trowel/);
  h.step('excavate', {tool: 'trowel'}); h.step('excavate', {tool: 'trowel'});
  assert.throws(() => h.step('excavate', {tool: 'trowel'}), /soft brush/);
  h.step('excavate', {tool: 'brush'});
  assert.throws(() => h.step('context', {contextId: '101', cell: 'A1'}), /Match the context/);
  assert.equal(h.items.length, 0); assert.equal(h.state.active.layerIndex, 0);
});
test('all three cases preserve different evidence and supported conservation outcomes', () => {
  let state = normalizeArchaeologyCareer(); const events = [], items = [], conclusions = [];
  for (const [index, variant] of Object.keys(ARCHAEOLOGY_STUDIES).entries()) {
    const h = studyHarness(state, variant, `archaeology-case-000${index}`); h.survey(); h.excavate(); h.lab(); h.report();
    state = h.state; events.push(...h.events); items.push(...h.items); conclusions.push(state.active.report.conclusion);
    assert.equal(h.items.length, 2); assert.ok(h.items.every(row => row.tradeable === false));
    for (const item of h.items) assert.ok(events.find(row => row.eventId === item.researchLabel.contextEventId)?.metadata.action.type === 'context');
  }
  assert.equal(new Set(conclusions).size, 3); assert.equal(items.filter(row => row.researchLabel.packing === 'supported-block').length, 1);
  assert.deepEqual(Object.keys(state.completed), Object.keys(ARCHAEOLOGY_STUDIES)); assert.ok(archaeologyCareerBadge(state));
  assert.doesNotThrow(() => validateArchaeologyCareerBackup(state, events.reverse(), items));
});
test('lab custody and uncertain classifications bound the final interpretation', () => {
  const h = studyHarness(); h.survey(); h.excavate();
  assert.throws(() => h.step('test', {contextId: '102', method: 'material', custody: []}), /Bring both/);
  h.lab({'102':'uncertain'});
  assert.throws(() => h.report(), /Support the interpretation/);
  assert.throws(() => h.report({interpretation: 'exact-year-and-owner'}), /Support the interpretation/);
  h.report({interpretation: 'need-more-evidence'}); assert.match(h.state.active.report.conclusion, /inconclusive/);
});
test('physical admission rejects live GPS, wrong elevation and stale evidence', () => {
  const h = studyHarness();
  for (const change of [{liveGps: true}, {verticalDistance: 3}, {at: -4000}, {travelMode: 'car'}]) {
    const command = h.command('inspect', {feature: h.study.feature}); Object.assign(command.evidence, change);
    assert.throws(() => transitionArchaeologyCareer(h.state, command, 1000), /Walk to the marked/);
  }
  assert.throws(() => transitionArchaeologyCareer(h.state, {...h.command('inspect'), revision: 0}, 1000), /another tab/);
});
test('backup replay rejects missing context, changed material and missing specimen custody', () => {
  const h = studyHarness(); h.survey(); h.excavate(); h.lab(); h.report();
  assert.doesNotThrow(() => validateArchaeologyCareerBackup(h.state, h.events, h.items));
  assert.throws(() => validateArchaeologyCareerBackup(h.state, h.events.filter(row => row.metadata.action.type !== 'context'), h.items));
  const wrong = structuredClone(h.items); wrong[0].researchLabel.contextId = '999';
  assert.throws(() => validateArchaeologyCareerBackup(h.state, h.events, wrong));
  assert.throws(() => validateArchaeologyCareerBackup(h.state, h.events, []));
});
test('interrupted excavation resumes its exact recorded context and grants one find', () => {
  const h = studyHarness(); h.survey(); for (const tool of ['trowel', 'trowel', 'brush']) h.step('excavate', {tool});
  const layer = h.study.layers[0]; h.step('context', {contextId: layer.id, cell: layer.cell, fabric: layer.fabric, orientation: layer.orientation, relationship: 'above-next'});
  assert.doesNotThrow(() => validateArchaeologyCareerBackup(h.state, h.events, h.items));
  const saved = structuredClone(h.state), command = h.command('collect', {packing: layer.artifact.packing});
  const result = transitionArchaeologyCareer(saved, command, 1000);
  assert.equal(result.samples[0].researchLabel.contextEventId, saved.active.contexts[layer.id].recordEventId);
  assert.throws(() => transitionArchaeologyCareer(result.state, command, 1000), /another tab/);
});
test('research domain registration preserves accepted geology and future profile fields', () => {
  const geology = {schemaVersion: 9, future: {keep: true}}, newer = {schemaVersion: 3, retained: 7};
  const normalized = normalizeResearchCareers({geology, unknownFutureCareer: newer});
  assert.deepEqual(normalized.geology, geology); assert.deepEqual(normalized.unknownFutureCareer, newer);
  assert.equal(normalized.archaeology.revision, 0); assert.throws(() => researchCareerDefinition('__proto__'));
  assert.throws(() => transitionArchaeologyCareer({schemaVersion: 2}, {revision: 0}, 1000), /newer version/);
});

test('archaeology practice uses the existing surveying and excavation progression once',()=>{
 const h=studyHarness();h.survey();h.excavate();h.lab();h.report();let character=createDefaultCharacterState({now:100});
 const meaningful=h.events.filter(row=>row.projections.profile);
 for(const event of meaningful)character=projectCharacterProgress(character,event,{meaningful:true}).character;
 assert.ok(character.specialties.surveying.xp>0);assert.ok(character.proficiencies.excavation.xp>0);
 assert.deepEqual(projectCharacterProgress(character,meaningful[0],{meaningful:true}).character,character);
});

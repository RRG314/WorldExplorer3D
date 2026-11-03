import {normalizePalaeontologyCareer,transitionPalaeontologyCareer,validatePalaeontologyCareerBackup} from './palaeontology-career.js';
import {normalizeGeologyCareer, transitionGeologyCareer, validateGeologyCareerBackup} from './geology-career.js';
import {normalizeArchaeologyCareer, transitionArchaeologyCareer, validateArchaeologyCareerBackup} from './archaeology-career.js';

// Pure domain contracts. IndexedDB, progression and custody retain one owner.
const definitions = Object.freeze({
  palaeontology:{normalize:normalizePalaeontologyCareer,transition:transitionPalaeontologyCareer,validateBackup:validatePalaeontologyCareerBackup},
  geology: {normalize: normalizeGeologyCareer, transition: transitionGeologyCareer, validateBackup: validateGeologyCareerBackup},
  archaeology: {normalize: normalizeArchaeologyCareer, transition: transitionArchaeologyCareer, validateBackup: validateArchaeologyCareerBackup}
});
export function researchCareerDefinition(id) {
  const definition = Object.hasOwn(definitions, id) ? definitions[id] : null;
  if (!definition) throw Error('Choose a supported field career.');
  return definition;
}
export function normalizeResearchCareers(value) {
  return {...(value || {}), ...Object.fromEntries(Object.entries(definitions).map(([id, definition]) => [id, definition.normalize(value?.[id])]))};
}
export function validateResearchCareerBackups(careers, events, items) {
  for (const [id, definition] of Object.entries(definitions)) definition.validateBackup(careers?.[id], events, items);
}

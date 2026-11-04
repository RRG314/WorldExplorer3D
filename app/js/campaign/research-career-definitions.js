import {normalizeMiningCareer,transitionMiningCareer,validateMiningCareerBackup} from './mining-career.js';
import {
  normalizeAcceleratorCareer,
  transitionAcceleratorCareer,
  validateAcceleratorCareerBackup,
} from './accelerator-career.js';
import {normalizeAstronomyCareer,transitionAstronomyCareer,validateAstronomyCareerBackup} from './astronomy-career.js';
import {normalizeCartographyCareer,transitionCartographyCareer,validateCartographyCareerBackup} from './cartography-career.js';
import {normalizeMeteorologyCareer,transitionMeteorologyCareer,validateMeteorologyCareerBackup} from './meteorology-career.js';
import {normalizeHydrologyCareer,transitionHydrologyCareer,validateHydrologyCareerBackup} from './hydrology-career.js';
import { normalizeMarineBiologyCareer, transitionMarineBiologyCareer, validateMarineBiologyCareerBackup } from './marine-biology-career.js';
import {
  normalizeOceanographyCareer,
  transitionOceanographyCareer,
  validateOceanographyCareerBackup
} from './oceanography-career.js';
import {
  normalizeBotanyCareer,
  transitionBotanyCareer,
  validateBotanyCareerBackup
} from './botany-career.js';
import {
  normalizeWildlifeCareer,
  transitionWildlifeCareer,
  validateWildlifeCareerBackup
} from './wildlife-career.js';
import {
  normalizePalaeontologyCareer,
  transitionPalaeontologyCareer,
  validatePalaeontologyCareerBackup
} from './palaeontology-career.js';
import {
  normalizeGeologyCareer,
  transitionGeologyCareer,
  validateGeologyCareerBackup
} from './geology-career.js';
import {
  normalizeArchaeologyCareer,
  transitionArchaeologyCareer,
  validateArchaeologyCareerBackup
} from './archaeology-career.js';

// Pure domain contracts. IndexedDB, progression and custody retain one owner.
const definitions = Object.freeze({
  accelerator: {
    normalize: normalizeAcceleratorCareer,
    transition: transitionAcceleratorCareer,
    validateBackup: validateAcceleratorCareerBackup
  },
  mining: {
    normalize: normalizeMiningCareer,
    transition: transitionMiningCareer,
    validateBackup: validateMiningCareerBackup
  },
  astronomy:{normalize:normalizeAstronomyCareer,transition:transitionAstronomyCareer,validateBackup:validateAstronomyCareerBackup},
  cartography:{normalize:normalizeCartographyCareer,transition:transitionCartographyCareer,validateBackup:validateCartographyCareerBackup},
  meteorology:{normalize:normalizeMeteorologyCareer,transition:transitionMeteorologyCareer,validateBackup:validateMeteorologyCareerBackup},
  hydrology:{normalize:normalizeHydrologyCareer,transition:transitionHydrologyCareer,validateBackup:validateHydrologyCareerBackup},
  'marine-biology': {normalize:normalizeMarineBiologyCareer,transition:transitionMarineBiologyCareer,validateBackup:validateMarineBiologyCareerBackup},
  oceanography: {
    normalize: normalizeOceanographyCareer,
    transition: transitionOceanographyCareer,
    validateBackup: validateOceanographyCareerBackup
  },
  botany: {
    normalize: normalizeBotanyCareer,
    transition: transitionBotanyCareer,
    validateBackup: validateBotanyCareerBackup
  },
  wildlife: {
    normalize: normalizeWildlifeCareer,
    transition: transitionWildlifeCareer,
    validateBackup: validateWildlifeCareerBackup
  },
  palaeontology: {
    normalize: normalizePalaeontologyCareer,
    transition: transitionPalaeontologyCareer,
    validateBackup: validatePalaeontologyCareerBackup
  },
  geology: {
    normalize: normalizeGeologyCareer,
    transition: transitionGeologyCareer,
    validateBackup: validateGeologyCareerBackup
  },
  archaeology: {
    normalize: normalizeArchaeologyCareer,
    transition: transitionArchaeologyCareer,
    validateBackup: validateArchaeologyCareerBackup
  }
});
export function researchCareerDefinition(id) {
  const definition = Object.hasOwn(definitions, id) ? definitions[id] : null;
  if (!definition) throw Error('Choose a supported field career.');
  return definition;
}
export function normalizeResearchCareers(value) {
  return {
    ...(value || {}),
    ...Object.fromEntries(
      Object.entries(definitions).map(([id, definition]) => [id, definition.normalize(value?.[id])])
    )
  };
}
export function validateResearchCareerBackups(careers, events, items) {
  for (const [id, definition] of Object.entries(definitions))
    definition.validateBackup(careers?.[id], events, items);
}

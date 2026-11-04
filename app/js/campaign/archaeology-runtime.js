import {ARCHAEOLOGY_STUDIES, ARCHAEOLOGY_OFFSETS, archaeologyTarget, normalizeArchaeologyCareer} from './archaeology-career.js';
import {createFieldResearchRuntime} from './field-research-runtime.js';
import {fieldResearchSiteDescriptor} from './field-research-places.js';
import {createArchaeologyPresentation} from './archaeology-presentation.js';
import {createArchaeologyUI} from './archaeology-ui.js';
export function createArchaeologyCareerRuntime(options) {
  return createFieldResearchRuntime({...options, domain: {
    id: 'archaeology', normalize: normalizeArchaeologyCareer, studies: ARCHAEOLOGY_STUDIES, offsets: ARCHAEOLOGY_OFFSETS,
    target: archaeologyTarget, itemIds: active => Object.values(active.artifacts).map(row => row.instanceId),
    stationLabel: id => ({feature: 'Visible site feature', survey: 'Survey instrument', trench: 'Training trench', bench: 'Catalog and conservation bench'})[id],
    siteDescriptor: place => fieldResearchSiteDescriptor('archaeology', place), createPresentation: createArchaeologyPresentation, createUI: createArchaeologyUI
  }});
}

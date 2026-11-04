import {
  PALAEONTOLOGY_STUDIES,
  PALAEONTOLOGY_OFFSETS,
  palaeontologyTarget,
  normalizePalaeontologyCareer
} from './palaeontology-career.js';
import { createFieldResearchRuntime } from './field-research-runtime.js';
import { fieldResearchSiteDescriptor } from './field-research-places.js';
import { createPalaeontologyPresentation } from './palaeontology-presentation.js';
import { createPalaeontologyUI } from './palaeontology-ui.js';
import { createFieldPhotoTool } from './field-photo-tool.js';
export function createPalaeontologyCareerRuntime(options) {
  return createFieldResearchRuntime({
    ...options,
    domain: {
      id: 'palaeontology',
      relocatable: true,
      label: 'fossil',
      normalize: normalizePalaeontologyCareer,
      studies: PALAEONTOLOGY_STUDIES,
      offsets: PALAEONTOLOGY_OFFSETS,
      target: palaeontologyTarget,
      itemIds: (active) => (active.specimen ? [active.specimen.instanceId] : []),
      stationLabel: (id) => (id === 'bed' ? 'Fossil bed' : 'Preparation bench'),
      siteDescriptor: (place) => fieldResearchSiteDescriptor('palaeontology', place),
      createPresentation: createPalaeontologyPresentation,
      createUI: createPalaeontologyUI,
      createTools: createFieldPhotoTool
    }
  });
}

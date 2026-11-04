import {
  WILDLIFE_STUDIES,
  WILDLIFE_OFFSETS,
  wildlifeTarget,
  normalizeWildlifeCareer
} from './wildlife-career.js';
import { createFieldResearchRuntime } from './field-research-runtime.js';
import { fieldResearchSiteDescriptor } from './field-research-places.js';
import { createWildlifePresentation, wildlifeSiteEligibility } from './wildlife-presentation.js';
import { createWildlifeUI } from './wildlife-ui.js';
import { createWildlifeTools } from './wildlife-tools.js';
export function createWildlifeCareerRuntime(options) {
  return createFieldResearchRuntime({
    ...options,
    domain: {
      id: 'wildlife',
      label: 'habitat',
      relocatable: true,
      normalize: normalizeWildlifeCareer,
      studies: WILDLIFE_STUDIES,
      offsets: WILDLIFE_OFFSETS,
      target: wildlifeTarget,
      itemIds: () => [],
      stationLabel: (id) =>
        id === 'bench' ? 'Comparison bench' : id === 'a' ? 'Wooded plot A' : 'Open plot B',
      siteDescriptor: (place) => fieldResearchSiteDescriptor('wildlife', place),
      eligibility: wildlifeSiteEligibility,
      createPresentation: createWildlifePresentation,
      createTools: createWildlifeTools,
      createUI: createWildlifeUI
    }
  });
}

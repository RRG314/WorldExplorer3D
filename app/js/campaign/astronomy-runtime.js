import { createFieldResearchRuntime } from './field-research-runtime.js';
import { fieldResearchSiteDescriptor } from './field-research-places.js';
import {
  ASTRONOMY_STUDIES,
  ASTRONOMY_OFFSETS,
  astronomyTarget,
  normalizeAstronomyCareer,
} from './astronomy-career.js';
import { createAstronomyPresentation, astronomySiteEligibility } from './astronomy-presentation.js';
import { createAstronomyTools } from './astronomy-tools.js';
import { createAstronomyUI, astronomyStationLabel } from './astronomy-ui.js';
export function createAstronomyCareerRuntime(options) {
  return createFieldResearchRuntime({
    ...options,
    domain: {
      id: 'astronomy',
      label: 'observing study',
      relocatable: true,
      normalize: normalizeAstronomyCareer,
      studies: ASTRONOMY_STUDIES,
      offsets: ASTRONOMY_OFFSETS,
      target: astronomyTarget,
      itemIds: () => [],
      stationLabel: astronomyStationLabel,
      completedSite: (s, id) => s.records?.[id]?.site || null,
      siteDescriptor: (p) => fieldResearchSiteDescriptor('astronomy', p),
      eligibility: astronomySiteEligibility,
      createPresentation: createAstronomyPresentation,
      createTools: createAstronomyTools,
      createUI: createAstronomyUI,
    },
  });
}

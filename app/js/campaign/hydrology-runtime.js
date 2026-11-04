import { createFieldResearchRuntime } from './field-research-runtime.js';
import { fieldResearchSiteDescriptor } from './field-research-places.js';
import {
  HYDROLOGY_STUDIES,
  HYDROLOGY_OFFSETS,
  hydrologyTarget,
  normalizeHydrologyCareer,
} from './hydrology-career.js';
import { createHydrologyPresentation, hydrologySiteEligibility } from './hydrology-presentation.js';
import { createHydrologyTools } from './hydrology-tools.js';
import { createHydrologyUI, hydrologyStationLabel } from './hydrology-ui.js';
export function createHydrologyCareerRuntime(options) {
  return createFieldResearchRuntime({
    ...options,
    domain: {
      id: 'hydrology',
      label: 'water study',
      relocatable: true,
      normalize: normalizeHydrologyCareer,
      studies: HYDROLOGY_STUDIES,
      offsets: HYDROLOGY_OFFSETS,
      target: hydrologyTarget,
      itemIds: () => [],
      stationLabel: hydrologyStationLabel,
      completedSite: (s, id) => s.records?.[id]?.site || null,
      siteDescriptor: (p) => fieldResearchSiteDescriptor('hydrology', p),
      eligibility: hydrologySiteEligibility,
      createPresentation: createHydrologyPresentation,
      createTools: createHydrologyTools,
      createUI: createHydrologyUI,
    },
  });
}

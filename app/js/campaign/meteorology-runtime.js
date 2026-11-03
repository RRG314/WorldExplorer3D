import { createFieldResearchRuntime } from './field-research-runtime.js';
import { fieldResearchSiteDescriptor } from './field-research-places.js';
import {
  METEOROLOGY_STUDIES,
  METEOROLOGY_OFFSETS,
  meteorologyTarget,
  normalizeMeteorologyCareer,
} from './meteorology-career.js';
import {
  createMeteorologyPresentation,
  meteorologySiteEligibility,
} from './meteorology-presentation.js';
import { createMeteorologyTools } from './meteorology-tools.js';
import { createMeteorologyUI, meteorologyStationLabel } from './meteorology-ui.js';
export function createMeteorologyCareerRuntime(options) {
  return createFieldResearchRuntime({
    ...options,
    domain: {
      id: 'meteorology',
      label: 'weather study',
      relocatable: true,
      normalize: normalizeMeteorologyCareer,
      studies: METEOROLOGY_STUDIES,
      offsets: METEOROLOGY_OFFSETS,
      target: meteorologyTarget,
      itemIds: () => [],
      stationLabel: meteorologyStationLabel,
      completedSite: (s, id) => s.records?.[id]?.site || null,
      siteDescriptor: (p) => fieldResearchSiteDescriptor('meteorology', p),
      eligibility: meteorologySiteEligibility,
      createPresentation: createMeteorologyPresentation,
      createTools: createMeteorologyTools,
      createUI: createMeteorologyUI,
    },
  });
}

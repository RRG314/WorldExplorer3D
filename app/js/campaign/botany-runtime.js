import {
  BOTANY_STUDIES,
  BOTANY_OFFSETS,
  botanyTarget,
  normalizeBotanyCareer
} from './botany-career.js';
import { createFieldResearchRuntime } from './field-research-runtime.js';
import { fieldResearchSiteDescriptor } from './field-research-places.js';
import { createBotanyPresentation, botanySiteEligibility } from './botany-presentation.js';
import { createBotanyTools } from './botany-tools.js';
import { createBotanyUI, botanyStationLabel } from './botany-ui.js';
export function createBotanyCareerRuntime(options) {
  return createFieldResearchRuntime({
    ...options,
    domain: {
      id: 'botany',
      label: 'plant study',
      relocatable: true,
      normalize: normalizeBotanyCareer,
      studies: BOTANY_STUDIES,
      offsets: BOTANY_OFFSETS,
      target: botanyTarget,
      itemIds: () => [],
      stationLabel: botanyStationLabel,
      completedSite: (state, id) => state.records?.[id]?.site || null,
      siteDescriptor: (place) => fieldResearchSiteDescriptor('botany', place),
      eligibility: botanySiteEligibility,
      createPresentation: createBotanyPresentation,
      createTools: createBotanyTools,
      createUI: createBotanyUI
    }
  });
}

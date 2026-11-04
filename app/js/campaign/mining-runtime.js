import { createFieldResearchRuntime } from './field-research-runtime.js';
import {
  MINING_JOBS,
  MINING_OFFSETS,
  miningTarget,
  normalizeMiningCareer,
} from './mining-career.js';
import { miningSiteDescriptor, miningYardAdmission } from './mining-places.js';
import { createMiningPresentation, miningSiteEligibility } from './mining-presentation.js';
import { createMiningTools } from './mining-tools.js';
import { createMiningUI, miningStationLabel } from './mining-ui.js';
export function createMiningCareerRuntime(options) {
  return createFieldResearchRuntime({
    ...options,
    domain: {
      id: 'mining',
      label: 'quarry study',
      relocatable: true,
      normalize: normalizeMiningCareer,
      studies: MINING_JOBS,
      offsets: MINING_OFFSETS,
      target: miningTarget,
      itemIds: (a) => (a.report ? ['research-mining:' + a.runId + ':marker-record'] : []),
      stationLabel: miningStationLabel,
      completedSite: (s, id) => s.records?.[id]?.site || null,
      siteDescriptor: miningSiteDescriptor,
      admission: miningYardAdmission,
      eligibility: miningSiteEligibility,
      createPresentation: createMiningPresentation,
      createTools: createMiningTools,
      createUI: createMiningUI,
    },
  });
}

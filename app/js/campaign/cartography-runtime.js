import { createFieldResearchRuntime } from './field-research-runtime.js';
import {
  CARTOGRAPHY_STUDIES,
  CARTOGRAPHY_POINTS,
  normalizeCartographyCareer,
  cartographyTarget,
} from './cartography-career.js';
import { qualifyCartographySite } from './cartography-site.js';
import { createCartographyPresentation } from './cartography-presentation.js';
import { createCartographyTools } from './cartography-tools.js';
import { createCartographyUI, cartographyStationLabel } from './cartography-ui.js';
import { fieldResearchSiteDescriptor } from './field-research-places.js';
export function createCartographyCareerRuntime(options) {
  return createFieldResearchRuntime({
    ...options,
    domain: {
      id: 'cartography',
      label: 'route survey',
      normalize: normalizeCartographyCareer,
      studies: CARTOGRAPHY_STUDIES,
      offsets: CARTOGRAPHY_POINTS,
      target: cartographyTarget,
      itemIds: () => [],
      stationLabel: cartographyStationLabel,
      completedSite: (s, id) => s.records?.[id]?.site || null,
      siteDescriptor: (p) => ({
        ...fieldResearchSiteDescriptor('cartography', p),
        name: (p.name || 'Selected location') + ' · virtual route survey',
      }),
      qualifySite: qualifyCartographySite,
      createPresentation: createCartographyPresentation,
      createTools: createCartographyTools,
      createUI: createCartographyUI,
    },
  });
}

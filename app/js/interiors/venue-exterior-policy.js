import {AQUARIUM_GEOGRAPHY} from './aquarium-geography.js';
import {isVehicleAssemblyBuilding} from '../world/kennedy-facility.js';
import {MUSEUM_CONTENT} from './museum-catalog.js';
import {isStableBuildingMetadataMapping} from '../world/building-provenance-model.js?v=1';

const identity = value => String(value || '').replace(/^osm:/, '').replace(/^(?:osm-way:|way:)/, 'way/');

// Use the same reviewed identities as interior admission. Names alone must
// never give an unrelated building a venue representation or a public door.
export function reviewedVenueForBuilding(building = {}) {
  if(isVehicleAssemblyBuilding(building))return 'kennedy-vab';
  const ids = [building.sourceBuildingId, building.buildingIdentity, building.id,
    building.buildingProvenance?.metadata?.stable ? building.buildingProvenance.metadata.sourceFeatureId : null,
    building.tags?._sourceFeatureId,
    isStableBuildingMetadataMapping(building.tags) ? building.tags?._buildingMetadataSourceId : null].map(identity);
  if (ids.includes(AQUARIUM_GEOGRAPHY.sourceId)) return 'national-aquarium-baltimore';
  if (MUSEUM_CONTENT.some(content => content.id === 'baltimore-natural-forms' &&
      content.association.sourceIds.some(id => ids.includes(identity(id))))) return 'peale-baltimore';
  return null;
}

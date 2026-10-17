import { MUSEUM_CONTENT } from './museum-catalog.js';

const sourceIds = new Set(MUSEUM_CONTENT.flatMap(content => content.association.sourceIds));

export function isLoadedMuseumBuilding(building) {
  const metadata = building?.buildingProvenance?.metadata;
  return sourceIds.has(building?.sourceBuildingId) ||
    (metadata?.stable === true && sourceIds.has(metadata.sourceFeatureId));
}

// The interior module normally loads on the first playable walking frame.
// Load its renderer preparation before that frame when this world actually
// contains a supported museum. This does not request models or admit a visit.
export async function ensureLoadedMuseumRuntime(ctx, isCurrent) {
  if (!(ctx.buildings || []).some(isLoadedMuseumBuilding)) return 'not-needed';
  if (!isCurrent()) return 'superseded';
  if (typeof ctx.ensureInteriorsReady !== 'function') throw new Error('Interior runtime is unavailable');
  await ctx.ensureInteriorsReady();
  return isCurrent() ? 'ready' : 'superseded';
}

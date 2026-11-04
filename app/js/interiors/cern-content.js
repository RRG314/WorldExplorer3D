import { CERN_SITE_REFERENCE } from './cern-site-reference.js';
import { matchMappedInteriorFootprint } from './content-contract.js';

// Content follows existing geographic entry/access admission. A name, nearby
// point or career selection cannot authorize another building or replace a save.
export function resolveCernInterior(ctx, support, definition) {
  if (
    !definition ||
    definition.accessDenied ||
    definition.communityRealityCapture ||
    definition.mode === 'mapped' ||
    definition.authoredLayout ||
    definition.curatedContent ||
    definition.aquariumContent ||
    definition.facilityContent
  )
    return definition;
  for (const site of CERN_SITE_REFERENCE) {
    const association = matchMappedInteriorFootprint(
      {
        kind: 'interpretive',
        association: {
          sourceIds: [site.sourceBuildingId, ...(site.sourceAliases || [])],
          footprint: site.footprint,
        },
      },
      support,
      (lat, lon) => ctx.geoToWorld(lat, lon),
      ctx.METERS_PER_WORLD_UNIT || 1
    );
    if (association)
      return {
        ...definition,
        label: site.label,
        cernContent: {
          siteId: site.id,
          sourceBuildingId: site.sourceBuildingId,
          accuracy: 'interpretive-training-visit',
          referenceUrl: site.referenceUrl,
        },
        contentAssociation: association,
      };
  }
  return definition;
}

import { ctx as appCtx } from '../shared-context.js?v=55';
import * as selection from '../earth-core/location-selection.js';

// Runtime compatibility adapter; portable selection has no active-world state.
export const wayCenterDistanceSq = (way, nodeMap) => selection.wayCenterDistanceSq(way, nodeMap, appCtx.LOC);
export const nodeDistanceSq = node => selection.nodeDistanceSq(node, appCtx.LOC);
export const limitWaysByDistance = (ways, nodeMap, limit, compareFn, options = {}) =>
  selection.limitWaysByDistance(ways, nodeMap, limit, compareFn, options, appCtx.LOC);
export const limitNodesByDistance = (nodes, limit) => selection.limitNodesByDistance(nodes, limit, appCtx.LOC);

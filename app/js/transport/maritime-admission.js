// Shared by first boarding and every movement step. A water label and distance
// from shore do not establish depth. Unknown depth remains explicitly unknown.
export function vesselWaterAdmission({catalog, candidate, x, z, yaw = 0, metersPerUnit = 1, contains}) {
  const deny = reason => ({allowed:false, reason, depthStatus:'unknown'});
  if (!catalog?.dimensions || !candidate || ![x,z,yaw,metersPerUnit].every(Number.isFinite) || metersPerUnit <= 0) {
    return deny('Vessel position or water coverage is unavailable.');
  }
  if (typeof contains !== 'function') return deny('Water coverage is still loading.');
  const {width,length,draft} = catalog.dimensions;
  // Existing vessel visuals are authored at catalogue dimensions in scene
  // units. Cover that rendered hull as well as its geographic metre envelope.
  const hullScale=Math.max(1,1/metersPerUnit);
  const halfWidth = width * .5 * hullScale, halfLength = length * .5 * hullScale;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const options = {includeWaterways:length < 32, edgeBuffer:Math.max(.6,width*.04)/metersPerUnit};
  // Nine points include bow/stern corners; the old moving check omitted these.
  for (const forward of [-halfLength,0,halfLength]) for (const side of [-halfWidth,0,halfWidth]) {
    if (!contains(x+c*side+s*forward,z-s*side+c*forward,options)) {
      return deny('This vessel needs more clear water around its hull. Choose a smaller boat or a wider launch point.');
    }
  }
  const evidence = candidate.source?.depthEvidence || candidate.depthEvidence;
  const depth = evidence?.depthMeters;
  const known = ['modeled','measured'].includes(evidence?.truthType) && Number.isFinite(depth) && depth >= 0;
  const requiredDepth = draft + Math.max(.3,draft*.2);
  if (known && depth < requiredDepth) return {...deny('The available water depth is too shallow for this vessel’s draft.'),depthStatus:evidence.truthType,requiredDepthMeters:requiredDepth};
  return {allowed:true,reason:'',depthStatus:known?evidence.truthType:'unknown',requiredDepthMeters:requiredDepth};
}

export function submarineDeploymentAdmission({catalog, speedMetersPerSecond, waterKind, waterType, shorelineDistance, requiredShorelineDistance}) {
  if (catalog?.capabilities?.deploySubmarine !== true) return {allowed:false,reason:'This boat has no submarine. Use its swimming ladder, or board a research vessel for submarine exploration.'};
  if (!Number.isFinite(speedMetersPerSecond) || speedMetersPerSecond > .5) return {allowed:false,reason:'Stop the research vessel before deploying its submarine.'};
  if (waterType !== 'area' || !['open_ocean','coastal'].includes(waterKind) || !Number.isFinite(shorelineDistance) || shorelineDistance < requiredShorelineDistance) {
    return {allowed:false,reason:'Deploy in clear coastal or ocean water. Use the swimming ladder for inland water.'};
  }
  return {allowed:true,reason:''};
}

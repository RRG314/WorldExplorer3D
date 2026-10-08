import { resolveWaterBodySurfaceY } from '../world/water-body-contract.js?v=4';

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function waterBedDepthAtShorelineDistance(distance, options = {}) {
  const featherDistance = Math.max(0.01, Number(options.featherDistance) || 6);
  const maximumDepth = Math.max(0, Number(options.maximumDepth) || 0.6);
  const blend = clamp01(Math.max(0, Number(distance) || 0) / featherDistance);
  const smoothBlend = blend * blend * (3 - 2 * blend);
  return maximumDepth * smoothBlend;
}

// Authored gameplay relief, not measured bathymetry. The rendered terrain and
// its contact sampler share this cut. Geographic depthEvidence remains unknown.
function waterGameplayBedProfile(area) {
  if(!area?.waterSchemaVersion || area.shape!=='area')return {maximumDepth:.6,featherDistance:6,truthType:'simulation'};
  const bounds=area.bounds;
  const span=bounds?Math.min(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ):0;
  const cap=['open_ocean','coastal'].includes(area.waterKind)?30:area.waterKind==='channel'?6:12;
  const maximumDepth=Math.min(cap,Math.max(.6,(Number.isFinite(span)?span:0)*.06));
  return {maximumDepth,featherDistance:Math.max(6,maximumDepth*5),truthType:'simulation'};
}

function waterTerrainBedY(area,x,z,terrainY,shorelineDistance,sampleWaterwayProfile) {
  const surfaceY=resolveWaterBodySurfaceY(area,x,z,{
    sampleWaterwayProfile,terrainHeightAt:()=>terrainY
  });
  return Number.isFinite(surfaceY)
    ? Math.min(terrainY,surfaceY-waterBedDepthAtShorelineDistance(shorelineDistance,waterGameplayBedProfile(area)))
    : terrainY;
}

export { waterGameplayBedProfile, waterBedDepthAtShorelineDistance, waterTerrainBedY };

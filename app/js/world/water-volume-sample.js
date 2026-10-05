import { normalizeDepthEvidence } from '../geospatial/bathymetry-evidence.js?v=1';

export function waterCurrentSample(evidence, waterKind, nowMs=Date.now()) {
  evidence = evidence?.currentEvidence || evidence;
  const speed=evidence?.currentVelocityKph,heading=evidence?.currentDirectionDeg;
  const validAt=Date.parse(evidence?.validAt || '');
  if (!['coastal','open_ocean'].includes(waterKind) || evidence?.truthType !== 'modeled' || evidence?.renderUsable !== true
    || !Number.isFinite(speed) || speed<0 || (speed>0 && !Number.isFinite(heading)) || !Number.isFinite(validAt)
    || Math.abs(nowMs-validAt)>3*3600000 || evidence.currentDirectionConvention !== 'direction-current-flows-to') {
    return {truthType:'unknown',vectorMetersPerSecond:null,sourceId:'none'};
  }
  const radians=(heading||0)*Math.PI/180,metersPerSecond=speed/3.6;
  return {truthType:'modeled',sourceId:evidence.sourceId,validAt:evidence.validAt,
    convention:'east-positive-x-south-positive-z',vectorMetersPerSecond:{x:Math.sin(radians)*metersPerSecond,y:0,z:-Math.cos(radians)*metersPerSecond}};
}

export function describeWaterVolume({candidate,surfaceY,baseY,normal,time,metersPerUnit=1,depthEvidence,bottomY=null,currentEvidence,nowMs}) {
  const source=candidate?.source || candidate;
  const covered=!!source && Number.isFinite(surfaceY);
  const units=Number.isFinite(metersPerUnit)&&metersPerUnit>0?metersPerUnit:1;
  const depth=normalizeDepthEvidence(depthEvidence || source?.depthEvidence);
  return {
    schemaVersion:1,volumeId:covered ? String(source.registryId || source.sourceFeatureId || source.id || `${source.waterKind || 'water'}:${source.centerX || 0}:${source.centerZ || 0}`) : null,
    coverage:covered ? 'known-water-body' : 'unresolved',
    surfaceY:covered?surfaceY:null,baseY:covered?baseY:null,normal:covered?normal:null,
    waveTimeSeconds:time,verticalDatum:source?.datum || {id:'engine_local_world_y_v1',method:'game-sea-level'},
    metersPerWorldUnit:units,
    bottomY:covered&&Number.isFinite(bottomY)?bottomY:null,
    gameplayDepthMeters:covered&&Number.isFinite(bottomY)?Math.max(0,(surfaceY-bottomY)*units):null,
    depthEvidence:depth,
    current:waterCurrentSample(covered?currentEvidence:null,source?.waterKind,nowMs)
  };
}

export function sampleImmersion(volume,feetY,headY) {
  if (volume?.coverage !== 'known-water-body' || !Number.isFinite(volume.surfaceY) || !Number.isFinite(feetY) || !Number.isFinite(headY) || headY<=feetY) {
    return {state:'unknown',fraction:null,headSubmerged:false,depthAtFeetMeters:null};
  }
  const submerged=volume.surfaceY-feetY;
  return {state:submerged<=0?'dry':volume.surfaceY>=headY?'submerged':'partial',
    fraction:Math.max(0,Math.min(1,submerged/(headY-feetY))),headSubmerged:volume.surfaceY>=headY,
    depthAtFeetMeters:Math.max(0,submerged)*volume.metersPerWorldUnit};
}

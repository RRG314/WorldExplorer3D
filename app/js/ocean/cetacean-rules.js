import {OCEAN_DEPTH_MODEL} from './depth-model.js';

export const COMMON_DOLPHIN = Object.freeze({
  speciesId:'short_beaked_common_dolphin',label:'Common dolphin',scientificName:'Delphinus delphis',
  assetId:'marine-common-dolphin',lengthMeters:2.3,count:3,
  source:'https://www.fisheries.noaa.gov/species/short-beaked-common-dolphin',
  evidence:'modeled-encounter-not-live-sighting',catchable:false
});

// Conservative initial game ranges, not full species distribution polygons.
// Bottom habitat (91–1980 m) is distinct from the animal's near-surface depth.
export function commonDolphinEligibility(context,depthProfile) {
  const environment=context?.environment,lat=environment?.latitude,lon=environment?.longitude;
  if(context?.access?.mode!=='underwater'||context?.waterbody?.waterKind!=='open_ocean')return {allowed:false,reason:'offshore-water-required'};
  if(depthProfile?.model!==OCEAN_DEPTH_MODEL.GEOGRAPHIC)return {allowed:false,reason:'metre-scale-water-required'};
  if(![lat,lon].every(Number.isFinite))return {allowed:false,reason:'location-unavailable'};
  if(environment.habitat&&!['unknown','open-water','pelagic'].includes(environment.habitat))return {allowed:false,reason:'habitat-not-supported'};
  const region=lat>=32&&lat<=42&&lon>=-127&&lon<=-117?'california-current':
    lat>=35.3&&lat<=45&&lon>=-76&&lon<=-60?'northwest-atlantic':null;
  return region?{allowed:true,region,evidence:COMMON_DOLPHIN.evidence}:{allowed:false,reason:'outside-reviewed-range'};
}

export function dolphinWaterEnvelope(water) {
  const v=water?.volume||water;
  if(!v||![v.surfaceY,v.bottomY,v.metersPerWorldUnit].every(Number.isFinite)||v.metersPerWorldUnit<=0)return null;
  const depth=(v.surfaceY-v.bottomY)*v.metersPerWorldUnit;
  return depth>=91&&depth<=1980?v:null;
}

// Authored observation behaviour: a short surface interval, then a shallow
// foraging arc. This is neither a breath-limit simulation nor a dive record.
export function dolphinTargetDepth(seconds,phase=0) {
  const t=((seconds+phase)%52+52)%52;
  if(t<5)return .08;
  return .08+12*Math.sin(Math.PI*(t-5)/47)**2;
}

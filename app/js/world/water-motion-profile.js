import { getWaveIntensity, inferWaterRenderContext, resolveWaterMotionProfile } from '../water-dynamics.js?v=9';
import { modeledWaveRenderControls } from './water-optics-evidence.js?v=2';

// One immutable derived profile per live water body, not per frame/material.
// Weak ownership releases the entry with its world. Compare scalar inputs so
// in-place edits to body bounds, weather evidence or runtime settings invalidate
// it too. No mutable scratch profile can leak across nested surface queries.
const profiles=new WeakMap();

// The wave field belongs to the water body, not to the player's travel mode or
// distance from its bank. Actual shoreline clearance stays a separate query.
export function resolveBodyWaveProfile(body = {}, options = {}) {
  const source = body?.source || body || {};
  const kindHint=source.waterKind || body?.waterKind,width=source.width,area=source.area;
  const bounds = source.bounds;
  const fetch = bounds ? Math.max(0, Math.min(bounds.maxX-bounds.minX, bounds.maxZ-bounds.minZ)*0.25)
    : source.shape === 'waterway' ? Math.max(0, Number(source.width)||0)*0.5
    : Number(body?.shorelineDistance)||0;
  const shorelineDistance=Number.isFinite(fetch)?fetch:0;
  const intensity=getWaveIntensity(options.intensity),active=options.active!==false;
  const energyScale=Number.isFinite(options.energyScale)?options.energyScale:1;
  const wave=options.waveEvidence;
  const truthType=wave?.truthType,renderUsable=wave?.renderUsable,waveHeightM=wave?.waveHeightM,
    wavePeriodS=wave?.wavePeriodS,sourceId=wave?.sourceId;
  const cacheable=typeof source==='object'&&source!==null;
  const prior=cacheable?profiles.get(source):null;
  if(prior&&prior.kindHint===kindHint&&prior.width===width&&prior.area===area&&
    prior.shorelineDistance===shorelineDistance&&prior.intensity===intensity&&prior.active===active&&prior.energyScale===energyScale&&
    prior.truthType===truthType&&prior.renderUsable===renderUsable&&prior.waveHeightM===waveHeightM&&prior.wavePeriodS===wavePeriodS&&prior.sourceId===sourceId)return prior.profile;
  const waterKind=inferWaterRenderContext({kindHint,width,area});
  const modeled = modeledWaveRenderControls(waterKind === 'lake' ? null : wave);
  const profile = resolveWaterMotionProfile({
    waterKind, shorelineDistance:waterKind === 'open_ocean' ? 420 : shorelineDistance,
    intensity:modeled.usable ? modeled.intensity : intensity,
    active,energyScale
  });
  if (modeled.usable) {
    profile.speed *= modeled.speedScale;
    profile.waveEvidenceSource = modeled.sourceId;
    profile.modeledWaveHeightM = modeled.waveHeightM;
    profile.modeledWavePeriodS = modeled.wavePeriodS;
  }
  Object.freeze(profile);
  if(cacheable)profiles.set(source,{kindHint,width,area,shorelineDistance,intensity,active,energyScale,
    truthType,renderUsable,waveHeightM,wavePeriodS,sourceId,profile});
  return profile;
}

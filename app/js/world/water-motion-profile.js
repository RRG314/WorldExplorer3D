import { inferWaterRenderContext, resolveWaterMotionProfile } from '../water-dynamics.js?v=9';
import { modeledWaveRenderControls } from './water-optics-evidence.js?v=2';

// The wave field belongs to the water body, not to the player's travel mode or
// distance from its bank. Actual shoreline clearance stays a separate query.
export function resolveBodyWaveProfile(body = {}, options = {}) {
  const source = body?.source || body || {};
  const waterKind = inferWaterRenderContext({kindHint:source.waterKind || body?.waterKind, width:source.width, area:source.area});
  const bounds = source.bounds;
  const fetch = bounds ? Math.max(0, Math.min(bounds.maxX-bounds.minX, bounds.maxZ-bounds.minZ)*0.25)
    : source.shape === 'waterway' ? Math.max(0, Number(source.width)||0)*0.5
    : Number(body?.shorelineDistance)||0;
  const modeled = modeledWaveRenderControls(waterKind === 'lake' ? null : options.waveEvidence);
  const profile = resolveWaterMotionProfile({
    waterKind, shorelineDistance:waterKind === 'open_ocean' ? 420 : fetch,
    intensity:modeled.usable ? modeled.intensity : options.intensity,
    active:options.active !== false, energyScale:options.energyScale
  });
  if (modeled.usable) {
    profile.speed *= modeled.speedScale;
    profile.waveEvidenceSource = modeled.sourceId;
    profile.modeledWaveHeightM = modeled.waveHeightM;
    profile.modeledWavePeriodS = modeled.wavePeriodS;
  }
  return profile;
}

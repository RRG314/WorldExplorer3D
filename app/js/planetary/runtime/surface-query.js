import { normalizeAstronomicalBodyId } from '../../astronomy/body-catalog.js?v=1';
import { getPlanetarySurfaceRegion } from './surface-authority.js?v=1';

function activePlanetaryBodyId(appContext) {
  if (appContext?.onMoon) return 'moon';
  if (appContext?.onMars) return 'mars';
  const bodyId = normalizeAstronomicalBodyId(
    appContext?.planetarySurfaceAuthority?.snapshot?.()?.active?.bodyId
  );
  return bodyId && bodyId !== 'earth' ? bodyId : null;
}

function samplePlanetarySurfaceAtRenderXZ(appContext, x, z, options = {}) {
  const renderX = Number(x);
  const renderZ = Number(z);
  if (!Number.isFinite(renderX) || !Number.isFinite(renderZ)) {
    throw new TypeError('Planetary surface render coordinates must be finite.');
  }
  const authority = appContext?.planetarySurfaceAuthority;
  const active = authority?.snapshot?.()?.active || null;
  if (!authority || !active) {
    return Object.freeze({ status: 'unavailable', reason: 'no-accepted-planetary-surface' });
  }
  const expectedBodyId = normalizeAstronomicalBodyId(
    options.bodyId || activePlanetaryBodyId(appContext)
  );
  if (!expectedBodyId) {
    return Object.freeze({ status: 'unavailable', reason: 'planetary-body-not-active' });
  }
  if (active.bodyId !== expectedBodyId) {
    return Object.freeze({ status: 'unavailable', reason: 'surface-body-mismatch' });
  }
  const manifest = getPlanetarySurfaceRegion(active.regionId);
  if (!manifest || manifest.bodyId !== active.bodyId) {
    return Object.freeze({ status: 'unavailable', reason: 'surface-manifest-unavailable' });
  }
  const localX = renderX - manifest.renderPlacement.x;
  const localZ = renderZ - manifest.renderPlacement.z;
  return authority.sampleAtLocalXZ(localX, localZ, {
    bodyId: expectedBodyId,
    regionId: manifest.regionId
  });
}

function planetarySurfaceYAtRenderXZ(appContext, x, z, options = {}) {
  const sample = samplePlanetarySurfaceAtRenderXZ(appContext, x, z, options);
  return sample.status === 'available' ? sample.render.y : null;
}

export {
  activePlanetaryBodyId,
  planetarySurfaceYAtRenderXZ,
  samplePlanetarySurfaceAtRenderXZ
};

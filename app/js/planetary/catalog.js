import { getAstronomicalBody } from '../astronomy/body-catalog.js?v=1';

function projectPlanetaryBody(id) {
  const body = getAstronomicalBody(id);
  if (!body) throw new Error(`Unknown planetary body projection: ${id}`);
  return Object.freeze({
    id: body.id,
    name: body.name,
    environment: body.presentation.environmentId,
    gravity: body.physical.surfaceGravityMps2,
    texture: body.presentation.globalTexturePath,
    radiusKm: body.physical.meanRadiusM / 1000,
    surfaceLabel: body.presentation.surfaceLabel,
    landingMode: body.exploration.landingMode,
    bodyCatalogVersion: body.catalogVersion
  });
}

// Compatibility projection for current Earth, Moon, and Mars consumers. The
// canonical facts live in astronomy/body-catalog.js; this object is read-only
// and must not grow into another body authority.
const PLANETARY_BODIES = Object.freeze({
  earth: projectPlanetaryBody('earth'),
  moon: projectPlanetaryBody('moon'),
  mars: projectPlanetaryBody('mars')
});

function normalizeBodyId(value) {
  const id = String(value || '').trim().toLowerCase();
  return PLANETARY_BODIES[id] ? id : null;
}

function getPlanetaryBody(value) {
  const id = normalizeBodyId(value);
  return id ? PLANETARY_BODIES[id] : null;
}

function getActivePlanetaryBody(appCtx) {
  if (appCtx?.onMars || appCtx?.getEnv?.() === appCtx?.ENV?.MARS) return PLANETARY_BODIES.mars;
  if (appCtx?.onMoon || appCtx?.getEnv?.() === appCtx?.ENV?.MOON) return PLANETARY_BODIES.moon;
  return PLANETARY_BODIES.earth;
}

function configureColorTexture(texture, renderer = null) {
  if (!texture) return texture;
  if (typeof THREE !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
    texture.colorSpace = THREE.SRGBColorSpace;
  } else if (typeof THREE !== 'undefined' && typeof THREE.sRGBEncoding !== 'undefined') {
    texture.encoding = THREE.sRGBEncoding;
  }
  const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 1;
  texture.anisotropy = Math.min(4, maxAnisotropy);
  return texture;
}

export {
  PLANETARY_BODIES,
  configureColorTexture,
  getActivePlanetaryBody,
  getPlanetaryBody,
  normalizeBodyId
};

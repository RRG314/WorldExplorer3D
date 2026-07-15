const PLANETARY_BODIES = Object.freeze({
  earth: Object.freeze({
    id: 'earth',
    name: 'Earth',
    environment: 'EARTH',
    gravity: 9.80665,
    texture: '/app/assets/textures/earth_atmos_2048.jpg',
    radiusKm: 6371,
    surfaceLabel: 'Earth'
  }),
  moon: Object.freeze({
    id: 'moon',
    name: 'Moon',
    environment: 'MOON',
    gravity: 1.62,
    texture: '/app/assets/textures/moon_lroc_2048.jpg',
    radiusKm: 1737.4,
    surfaceLabel: 'Mare Tranquillitatis'
  }),
  mars: Object.freeze({
    id: 'mars',
    name: 'Mars',
    environment: 'MARS',
    gravity: 3.71,
    texture: '/app/assets/textures/mars_viking_4096.jpg',
    radiusKm: 3389.5,
    surfaceLabel: 'Olympus Mons, Tharsis'
  })
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

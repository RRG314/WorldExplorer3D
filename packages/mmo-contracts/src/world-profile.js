const KNOWN_WORLD_PROFILES = Object.freeze({
  earth: Object.freeze({
    label: 'Earth',
    gravityMps2: 9.80665,
    radiusMeters: 6378137,
    dayLengthSeconds: 86164.0905,
    atmosphereRelative: 1,
    terrainSource: 'earth-authoritative'
  }),
  moon: Object.freeze({
    label: 'Moon',
    gravityMps2: 1.62,
    radiusMeters: 1737400,
    dayLengthSeconds: 2360591.5,
    atmosphereRelative: 0,
    terrainSource: 'lunar-authoritative'
  }),
  mars: Object.freeze({
    label: 'Mars',
    gravityMps2: 3.72076,
    radiusMeters: 3389500,
    dayLengthSeconds: 88775.244,
    atmosphereRelative: 0.006,
    terrainSource: 'mars-authoritative'
  }),
  space: Object.freeze({
    label: 'Space',
    gravityMps2: 0,
    radiusMeters: 0,
    dayLengthSeconds: 0,
    atmosphereRelative: 0,
    terrainSource: 'astronomy-authoritative'
  })
});

function finite(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max, fallback) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function safeText(value, fallback, max = 80) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max) || fallback;
}

function normalizeWorldProfile(world = {}) {
  const kind = String(world.kind || 'earth');
  const known = KNOWN_WORLD_PROFILES[kind];
  if (known) return Object.freeze({ kind, ...known, sourceCatalogId: '' });
  if (kind === 'custom_space') {
    return Object.freeze({
      kind,
      label: safeText(world.label, 'Creator Space'),
      gravityMps2: 0,
      radiusMeters: 0,
      dayLengthSeconds: 0,
      atmosphereRelative: 0,
      terrainSource: 'room-authored',
      sourceCatalogId: safeText(world.sourceCatalogId, '', 120)
    });
  }
  return Object.freeze({
    kind: kind === 'custom_planet' ? 'custom_planet' : 'custom_world',
    label: safeText(world.label, 'Creator World'),
    gravityMps2: clamp(world.gravityMps2, 0, 50, 9.80665),
    radiusMeters: clamp(world.radiusMeters, 100, 10000000, 10000),
    dayLengthSeconds: clamp(world.dayLengthSeconds, 300, 31557600, 86400),
    atmosphereRelative: clamp(world.atmosphereRelative, 0, 10, 1),
    terrainSource: 'room-authored',
    sourceCatalogId: safeText(world.sourceCatalogId, '', 120)
  });
}

export { KNOWN_WORLD_PROFILES, normalizeWorldProfile };

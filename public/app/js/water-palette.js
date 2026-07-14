const WATER_PALETTES = Object.freeze({
  harbor: Object.freeze({ surface: 0x2d73a6, emissive: 0x08243b }),
  channel: Object.freeze({ surface: 0x2b78aa, emissive: 0x072a44 }),
  lake: Object.freeze({ surface: 0x3f88b8, emissive: 0x0b2c46 }),
  coastal: Object.freeze({ surface: 0x267caf, emissive: 0x07263f }),
  open_ocean: Object.freeze({ surface: 0x1f6b9d, emissive: 0x061e35 }),
  default: Object.freeze({ surface: 0x2d7cad, emissive: 0x08243d })
});

function getWaterPalette(kind = '') {
  return WATER_PALETTES[String(kind || '').toLowerCase()] || WATER_PALETTES.default;
}

export { getWaterPalette, WATER_PALETTES };

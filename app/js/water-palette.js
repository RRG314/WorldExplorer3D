const WATER_PALETTES = Object.freeze({
  harbor: Object.freeze({ surface: 0x1b526b, emissive: 0x061722 }),
  channel: Object.freeze({ surface: 0x1d5c76, emissive: 0x061922 }),
  lake: Object.freeze({ surface: 0x256780, emissive: 0x071b26 }),
  coastal: Object.freeze({ surface: 0x145574, emissive: 0x051720 }),
  open_ocean: Object.freeze({ surface: 0x0d476a, emissive: 0x04131e }),
  default: Object.freeze({ surface: 0x1b5a76, emissive: 0x061722 })
});

function getWaterPalette(kind = '') {
  return WATER_PALETTES[String(kind || '').toLowerCase()] || WATER_PALETTES.default;
}

export { getWaterPalette, WATER_PALETTES };

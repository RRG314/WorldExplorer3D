const RARITY = Object.freeze({
  common: { label: 'Common', weight: 1, score: 1 },
  uncommon: { label: 'Uncommon', weight: 0.62, score: 1.35 },
  rare: { label: 'Rare', weight: 0.28, score: 1.9 },
  trophy: { label: 'Trophy', weight: 0.1, score: 2.8 }
});

const FISH_SPECIES = Object.freeze([
  {
    id: 'largemouth_bass', name: 'Largemouth Bass', waterKinds: ['lake', 'river', 'channel'],
    latitude: [-48, 58], length: [24, 78], trophyLength: 61, condition: 1.08,
    strength: 0.48, rarity: 'common', behavior: 'head-shake',
    visual: { body: '#587246', belly: '#d9d6a8', fin: '#4b633e', stripe: '#263d2d', shape: 'bass' }
  },
  {
    id: 'rainbow_trout', name: 'Rainbow Trout', waterKinds: ['lake', 'river'],
    latitude: [-54, 68], length: [22, 86], trophyLength: 64, condition: 0.94,
    strength: 0.55, rarity: 'uncommon', behavior: 'leap',
    visual: { body: '#8eaaa8', belly: '#e9e6d7', fin: '#a67b65', stripe: '#d17486', spots: true, shape: 'trout' }
  },
  {
    id: 'northern_pike', name: 'Northern Pike', waterKinds: ['lake', 'river', 'channel'],
    latitude: [34, 74], length: [38, 132], trophyLength: 100, condition: 0.62,
    strength: 0.72, rarity: 'rare', behavior: 'ambush',
    visual: { body: '#687c52', belly: '#d5d5b8', fin: '#8f6947', stripe: '#c3cb8d', spots: true, shape: 'long' }
  },
  {
    id: 'channel_catfish', name: 'Channel Catfish', waterKinds: ['lake', 'river', 'channel', 'harbor'],
    latitude: [-35, 62], length: [30, 118], trophyLength: 88, condition: 1.22,
    strength: 0.68, rarity: 'uncommon', behavior: 'deep-dive',
    visual: { body: '#657481', belly: '#d8d1b7', fin: '#596771', stripe: '#39444d', whiskers: true, shape: 'catfish' }
  },
  {
    id: 'common_carp', name: 'Common Carp', waterKinds: ['lake', 'river', 'channel', 'harbor'],
    latitude: [-52, 68], length: [34, 112], trophyLength: 89, condition: 1.5,
    strength: 0.64, rarity: 'common', behavior: 'steady',
    visual: { body: '#9b7a3e', belly: '#d9c58d', fin: '#74582f', stripe: '#66502b', scales: true, shape: 'deep' }
  },
  {
    id: 'striped_bass', name: 'Striped Bass', waterKinds: ['coastal', 'harbor', 'channel', 'open_ocean'],
    latitude: [18, 58], length: [34, 132], trophyLength: 102, condition: 1.02,
    strength: 0.7, rarity: 'uncommon', behavior: 'surge',
    visual: { body: '#9eaaa7', belly: '#edf0e8', fin: '#6f7c7a', stripe: '#303f44', stripes: 5, shape: 'bass' }
  },
  {
    id: 'red_drum', name: 'Red Drum', waterKinds: ['coastal', 'harbor', 'channel'],
    latitude: [5, 42], length: [36, 142], trophyLength: 105, condition: 1.04,
    strength: 0.73, rarity: 'uncommon', behavior: 'surge',
    visual: { body: '#b56c4c', belly: '#e9d7bb', fin: '#8d503b', stripe: '#6b382c', tailSpot: true, shape: 'drum' }
  },
  {
    id: 'summer_flounder', name: 'Summer Flounder', waterKinds: ['coastal', 'harbor', 'channel'],
    latitude: [20, 52], length: [28, 92], trophyLength: 70, condition: 0.9,
    strength: 0.38, rarity: 'common', behavior: 'bottom-run',
    visual: { body: '#897a5d', belly: '#d9cfb7', fin: '#665b46', stripe: '#4f4739', spots: true, shape: 'flat' }
  },
  {
    id: 'mahi_mahi', name: 'Mahi-Mahi', waterKinds: ['coastal', 'open_ocean'],
    latitude: [-32, 32], length: [52, 176], trophyLength: 132, condition: 0.72,
    strength: 0.84, rarity: 'rare', behavior: 'leap',
    visual: { body: '#2d9b91', belly: '#e5d76b', fin: '#226d8b', stripe: '#69c4b2', spots: true, shape: 'mahi' }
  },
  {
    id: 'atlantic_tarpon', name: 'Atlantic Tarpon', waterKinds: ['coastal', 'harbor', 'open_ocean'],
    latitude: [-30, 38], length: [78, 236], trophyLength: 178, condition: 0.82,
    strength: 0.94, rarity: 'trophy', behavior: 'leap',
    visual: { body: '#a9b8bd', belly: '#edf0ed', fin: '#71868d', stripe: '#52676d', scales: true, shape: 'tarpon' }
  },
  {
    id: 'bluefin_tuna', name: 'Bluefin Tuna', waterKinds: ['open_ocean', 'coastal'],
    latitude: [-46, 64], length: [82, 284], trophyLength: 210, condition: 1.18,
    strength: 1, rarity: 'trophy', behavior: 'power-dive',
    visual: { body: '#304f65', belly: '#d7dfe0', fin: '#d4b84c', stripe: '#203746', shape: 'tuna' }
  },
  {
    id: 'yellowfin_tuna', name: 'Yellowfin Tuna', waterKinds: ['open_ocean', 'coastal'],
    latitude: [-38, 38], length: [68, 224], trophyLength: 168, condition: 1.02,
    strength: 0.93, rarity: 'rare', behavior: 'power-dive',
    visual: { body: '#315b70', belly: '#e7e5c8', fin: '#f1cb39', stripe: '#274453', shape: 'tuna' }
  },
  {
    id: 'sailfish', name: 'Sailfish', waterKinds: ['open_ocean'],
    latitude: [-34, 34], length: [96, 276], trophyLength: 220, condition: 0.54,
    strength: 0.96, rarity: 'trophy', behavior: 'sprint',
    visual: { body: '#355f75', belly: '#d9e0d8', fin: '#2b6d88', stripe: '#203c4a', sail: true, shape: 'billfish' }
  },
  {
    id: 'giant_trevally', name: 'Giant Trevally', waterKinds: ['coastal', 'open_ocean', 'harbor'],
    latitude: [-34, 34], length: [46, 164], trophyLength: 128, condition: 1.36,
    strength: 0.9, rarity: 'rare', behavior: 'reef-run',
    visual: { body: '#79888a', belly: '#d9ded9', fin: '#4f5d61', stripe: '#303c40', shape: 'deep' }
  }
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function weightedPick(entries, random = Math.random) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random() * Math.max(total, 0.0001);
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.species;
  }
  return entries[entries.length - 1]?.species || FISH_SPECIES[0];
}

function selectSpecies({ waterKind = 'coastal', latitude = 0, random = Math.random } = {}) {
  const normalizedWater = String(waterKind || 'coastal').toLowerCase();
  const lat = Number.isFinite(Number(latitude)) ? Number(latitude) : 0;
  let candidates = FISH_SPECIES.filter((species) => (
    species.waterKinds.includes(normalizedWater) &&
    lat >= species.latitude[0] &&
    lat <= species.latitude[1]
  ));
  if (!candidates.length) {
    candidates = FISH_SPECIES.filter((species) => species.waterKinds.includes(normalizedWater));
  }
  if (!candidates.length) candidates = FISH_SPECIES.slice();
  return weightedPick(candidates.map((species) => ({
    species,
    weight: RARITY[species.rarity].weight * (0.82 + random() * 0.36)
  })), random);
}

function generateFish(options = {}) {
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const species = selectSpecies({ ...options, random });
  const sizeRoll = Math.pow(random(), 1.65);
  const lengthCm = species.length[0] + (species.length[1] - species.length[0]) * sizeRoll;
  const conditionRoll = 0.88 + random() * 0.24;
  const weightKg = species.condition * conditionRoll * Math.pow(lengthCm, 3) / 100000;
  const trophy = lengthCm >= species.trophyLength;
  const rarity = trophy ? 'trophy' : species.rarity;
  const strength = clamp(species.strength * (0.72 + sizeRoll * 0.42) * (0.94 + random() * 0.14), 0.24, 1.12);
  const score = Math.round(
    weightKg * 92 * RARITY[rarity].score +
    lengthCm * strength * 3.2 +
    (trophy ? 900 : 0)
  );
  return {
    id: `${species.id}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    speciesId: species.id,
    species: species.name,
    behavior: species.behavior,
    rarity,
    rarityLabel: RARITY[rarity].label,
    lengthCm: Number(lengthCm.toFixed(1)),
    weightKg: Number(weightKg.toFixed(2)),
    strength: Number(strength.toFixed(3)),
    baseScore: score,
    measurementTruth: 'simulated-estimate',
    modelBasis: 'species-range-randomized-v1',
    visual: { ...species.visual }
  };
}

function fishMetricText(fish) {
  if (!fish) return '';
  const pounds = fish.weightKg * 2.2046226218;
  const inches = fish.lengthCm / 2.54;
  return `Est. ${fish.weightKg.toFixed(2)} kg / ${pounds.toFixed(1)} lb | ${fish.lengthCm.toFixed(1)} cm / ${inches.toFixed(1)} in`;
}

export { FISH_SPECIES, RARITY, fishMetricText, generateFish, selectSpecies };

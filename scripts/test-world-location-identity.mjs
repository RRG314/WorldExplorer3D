import assert from 'node:assert/strict';
import { assertWorldLocationIdentity } from './world-matrix-assertions.mjs';

const preset = {
  id: 'baltimore',
  kind: 'preset',
  key: 'baltimore'
};
assert.doesNotThrow(() => assertWorldLocationIdentity(preset, {
  locationPresentation: {
    selected: 'baltimore',
    origin: { lat: 39.2904, lon: -76.6122 },
    resolvedHudLabel: 'Baltimore, Maryland',
    renderedHudLabel: 'Baltimore, Maryland',
    placeState: {
      display: 'Baltimore, Maryland',
      lat: 39.2904,
      lon: -76.6122
    }
  }
}));

const custom = {
  id: 'giza',
  kind: 'custom',
  lat: 29.9792,
  lon: 31.1342,
  label: 'Great Pyramids of Giza'
};
assert.doesNotThrow(() => assertWorldLocationIdentity(custom, {
  locationPresentation: {
    selected: 'custom',
    customName: 'Great Pyramids of Giza',
    origin: { lat: 29.9792, lon: 31.1342 },
    resolvedHudLabel: 'Giza, Egypt',
    renderedHudLabel: 'Giza, Egypt',
    placeState: { display: 'Giza, Egypt', lat: 29.9793, lon: 31.1341 }
  }
}));

assert.doesNotThrow(() => assertWorldLocationIdentity(custom, {
  locationPresentation: {
    selected: 'custom',
    customName: 'Great Pyramids of Giza',
    origin: { lat: 29.9792, lon: 31.1342 },
    resolvedHudLabel: 'Lauterbrunnen, Verwaltungskreis Interlaken-Oberhasli, Bern/Berne, Schweiz/Suisse',
    renderedHudLabel: 'Lauterbrunnen, Verwaltungskreis Interlaken-Oberhasl…',
    placeState: {
      display: 'Lauterbrunnen, Verwaltungskreis Interlaken-Oberhasli, Bern/Berne, Schweiz/Suisse',
      lat: 29.9792,
      lon: 31.1342
    }
  }
}));

assert.doesNotThrow(() => assertWorldLocationIdentity(custom, {
  locationPresentation: {
    selected: 'custom',
    customName: 'Great Pyramids of Giza',
    origin: { lat: 29.9792, lon: 31.1342 },
    resolvedHudLabel: 'Giza, Egypt',
    renderedHudLabel: 'Giza, Egypt • 97m to shore',
    placeState: { display: 'Giza, Egypt', lat: 29.9792, lon: 31.1342 }
  }
}));

assert.throws(() => assertWorldLocationIdentity(preset, {
  locationPresentation: {
    selected: 'monaco',
    origin: { lat: 39.2904, lon: -76.6122 },
    resolvedHudLabel: 'Baltimore, Maryland',
    renderedHudLabel: 'Baltimore, Maryland'
  }
}), /published selection does not match/);

assert.throws(() => assertWorldLocationIdentity(preset, {
  locationPresentation: {
    selected: 'baltimore',
    origin: { lat: 39.2904, lon: -76.6122 },
    resolvedHudLabel: 'Baltimore, Maryland',
    renderedHudLabel: 'London, United Kingdom'
  }
}), /rendered HUD identity differs/);

assert.throws(() => assertWorldLocationIdentity(preset, {
  locationPresentation: {
    selected: 'baltimore',
    origin: { lat: 39.2904, lon: -76.6122 },
    resolvedHudLabel: 'London, United Kingdom',
    renderedHudLabel: 'London, United Kingdom',
    placeState: { display: 'London, United Kingdom', lat: 51.5074, lon: -0.1278 }
  }
}), /HUD accepted a place label from another loaded location/);

console.log(JSON.stringify({
  ok: true,
  contract: 'published-world-location-identity',
  verified: [
    'preset-selection',
    'custom-origin-and-name',
    'rendered-hud-matches-resolved-location-with-production-truncation-and-context',
    'reverse-geocode-coordinate-match'
  ]
}, null, 2));

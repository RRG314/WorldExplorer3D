import assert from 'node:assert/strict';
import test from 'node:test';
import { ctx } from '../app/js/shared-context.js?v=55';

// Execute the real map painter, tile cache and UI initialization. Image URLs
// stand in for the network; no source-text assertion can pass this regression.
test('closed map initialization fetches nothing; opening, zooming and reopening paint the selected world', async () => {
  const priorDocument = globalThis.document;
  const priorImage = globalThis.Image;
  const requests = [];
  let paints = 0;
  const canvasContext = new Proxy({}, { get(target, key) {
    if (key === 'fillRect') return () => { paints += 1; };
    return target[key] ?? (() => {});
  }});
  const canvas = {getContext: () => canvasContext, addEventListener() {}};
  globalThis.document = {getElementById: id => ['minimap', 'largeMapCanvas'].includes(id) ? canvas : null};
  globalThis.Image = class {set src(value) {requests.push(value);}};
  Object.assign(ctx, {showLargeMap: false, LOC: {lat: 39.2904, lon: -76.6122}, SCALE: 111320,
    car: {x: 0, z: 0, angle: 0}, waterAreas: [], waterways: [], linearFeatures: [], roads: [], pois: [], mapLayers: {}, customTrack: [], checkpoints: [],
    showPOIs: {}, gameMode: 'free', minimapZoom: 15, largeMapZoom: 14});
  try {
    const {drawLargeMap, latLonToTile} = await import('../app/js/map/runtime.js?v=7');
    const {initMapInteractions} = await import('../app/js/ui/map-interactions.js?v=61');
    initMapInteractions();
    assert.equal(paints, 0);
    assert.deepEqual(requests, []);
    ctx.LOC = {lat: 39.6612, lon: -76.8847};
    ctx.openLargeMap();
    assert.equal(paints, 1);
    assert.ok(requests.length > 0);
    const center = latLonToTile(ctx.LOC.lat, ctx.LOC.lon, ctx.largeMapZoom);
    assert.ok(requests.includes(`https://tile.openstreetmap.org/${center.zoom}/${center.x}/${center.y}.png`));
    const afterOpen = requests.length;
    ctx.adjustLargeMapZoom(1);
    assert.equal(paints, 2);
    assert.ok(requests.length > afterOpen);
    ctx.closeLargeMap();
    const afterZoom = requests.length;
    ctx.adjustLargeMapZoom(1);
    drawLargeMap();
    assert.equal(paints, 2);
    assert.equal(requests.length, afterZoom);
    ctx.openLargeMap();
    assert.equal(paints, 3);
    assert.ok(requests.length > afterZoom);
  } finally {
    if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument;
    if (priorImage === undefined) delete globalThis.Image; else globalThis.Image = priorImage;
  }
});

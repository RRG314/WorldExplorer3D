import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  carSpeedToMph,
  carSpeedToWorldUnitsPerSecond,
  mphToCarSpeed,
  mphToWorldUnitsPerSecond
} from '../app/js/physics/vehicle-speed-units.js';

const metersPerWorldUnit = 1.11;
const topSimulationSpeed = 120;
const topMph = carSpeedToMph(topSimulationSpeed);
const topWorldSpeed = carSpeedToWorldUnitsPerSecond(topSimulationSpeed, metersPerWorldUnit);

assert.equal(topMph, 60, 'the established 120-unit car limit must still present as 60 MPH');
assert.equal(mphToCarSpeed(topMph), topSimulationSpeed, 'MPH and simulation speed must round-trip');
assert.ok(Math.abs(topWorldSpeed - mphToWorldUnitsPerSecond(60, metersPerWorldUnit)) < 1e-9);

const tenSecondDistanceMeters = topWorldSpeed * 10 * metersPerWorldUnit;
assert.ok(
  Math.abs(tenSecondDistanceMeters - 268.224) < 0.001,
  `60 MPH covered ${tenSecondDistanceMeters.toFixed(3)} m in ten seconds instead of 268.224 m`
);
assert.equal(carSpeedToMph(-80), -40, 'reverse speed must preserve its sign');
assert.ok(
  carSpeedToWorldUnitsPerSecond(-80, metersPerWorldUnit) < 0,
  'reverse world velocity must preserve its sign'
);

const physicsSource = await fs.readFile(new URL('../app/js/physics.js', import.meta.url), 'utf8');
assert.match(
  physicsSource,
  /carSpeedToWorldUnitsPerSecond\(appCtx\.car\.vFwd, appCtx\.METERS_PER_WORLD_UNIT\)/,
  'Earth car displacement must use the geospatial world-speed conversion'
);
assert.doesNotMatch(
  physicsSource,
  /appCtx\.car\.vx\s*=\s*sinA\s*\*\s*appCtx\.car\.vFwd/,
  'raw simulation speed must not be integrated directly into Earth map coordinates'
);

const mphConsumers = [
  '../app/js/hud.js',
  '../app/js/game/police.js',
  '../app/js/runtime/debug-presentation.js',
  '../app/js/perf.js',
  '../app/js/terrain/streaming.js'
];
for (const relativePath of mphConsumers) {
  const source = await fs.readFile(new URL(relativePath, import.meta.url), 'utf8');
  assert.match(source, /carSpeedToMph/, `${relativePath} does not use the canonical MPH conversion`);
  assert.doesNotMatch(
    source,
    /appCtx\.car(?:\?\.)?\.speed[^\n;]*\*\s*0\.5/,
    `${relativePath} retains a private MPH scale`
  );
}

console.log(JSON.stringify({
  ok: true,
  topMph,
  topWorldSpeed: Number(topWorldSpeed.toFixed(6)),
  tenSecondDistanceMeters: Number(tenSecondDistanceMeters.toFixed(3))
}, null, 2));

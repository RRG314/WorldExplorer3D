import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  carSpeedToMph,
  carSpeedToWorldUnitsPerSecond,
  mphToCarSpeed,
  mphToWorldUnitsPerSecond
} from '../app/js/physics/vehicle-speed-units.js';
import { ROAD_CAR_CONFIG } from '../app/js/physics/vehicle-config.js';

const metersPerWorldUnit = 1.11;
const topSimulationSpeed = ROAD_CAR_CONFIG.maxSpd;
const topMph = carSpeedToMph(topSimulationSpeed);
const topWorldSpeed = carSpeedToWorldUnitsPerSecond(topSimulationSpeed, metersPerWorldUnit);

assert.equal(topMph, 90, 'the normal road-car limit must present as 90 MPH');
assert.equal(mphToCarSpeed(topMph), topSimulationSpeed, 'MPH and simulation speed must round-trip');
assert.ok(Math.abs(topWorldSpeed - mphToWorldUnitsPerSecond(90, metersPerWorldUnit)) < 1e-9);

const tenSecondDistanceMeters = topWorldSpeed * 10 * metersPerWorldUnit;
assert.ok(
  Math.abs(tenSecondDistanceMeters - 402.336) < 0.001,
  `90 MPH covered ${tenSecondDistanceMeters.toFixed(3)} m in ten seconds instead of 402.336 m`
);
assert.ok(
  Math.abs(mphToWorldUnitsPerSecond(60, metersPerWorldUnit) * 10 * metersPerWorldUnit - 268.224) < 0.001,
  'the physical 60 MPH distance must remain 268.224 m in ten seconds'
);
assert.equal(carSpeedToMph(-80), -40, 'reverse speed must preserve its sign');
assert.ok(
  carSpeedToWorldUnitsPerSecond(-80, metersPerWorldUnit) < 0,
  'reverse world velocity must preserve its sign'
);

const physicsSource = await fs.readFile(new URL('../app/js/physics.js', import.meta.url), 'utf8');
assert.equal(ROAD_CAR_CONFIG.accel, 80);
assert.equal(ROAD_CAR_CONFIG.boostAccel, 120);
assert.equal(ROAD_CAR_CONFIG.boostMax, 240);
assert.equal(Object.isFrozen(ROAD_CAR_CONFIG), true);

let accelerationSpeed = 0;
let accelerationSeconds = 0;
const accelerationStep = 1 / 120;
while (carSpeedToMph(accelerationSpeed) < 60 && accelerationSeconds < 10) {
  accelerationSpeed += ROAD_CAR_CONFIG.accel *
    (1 - accelerationSpeed / topSimulationSpeed * 0.7) * accelerationStep;
  accelerationSeconds += accelerationStep;
}
assert.ok(
  accelerationSeconds >= 1.8 && accelerationSeconds <= 2.3,
  `0-60 MPH took ${accelerationSeconds.toFixed(3)} seconds instead of the intended sporty range`
);
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
  '../app/js/perf.js'
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
  tenSecondDistanceMeters: Number(tenSecondDistanceMeters.toFixed(3)),
  zeroToSixtySeconds: Number(accelerationSeconds.toFixed(3))
}, null, 2));

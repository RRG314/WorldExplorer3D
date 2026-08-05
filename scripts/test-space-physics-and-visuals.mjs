import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  displayScaledGravityMu,
  inverseSquareGravityAcceleration,
  surfaceGravityMps2
} from '../app/js/space/gravity-model.js';
import { SOLAR_SYSTEM_PLANETS } from '../app/js/solar-system/catalog.js';

const earth = { ...SOLAR_SYSTEM_PLANETS.find((planet) => planet.name === 'Earth'), radius: 50 };
const moon = { massKg: 7.342e22, physicalRadiusKm: 1737.4, radius: 13.5 };
assert.ok(Math.abs(surfaceGravityMps2(earth) - 9.82) < 0.08, 'Earth gravity must derive from measured mass and radius');
assert.ok(Math.abs(surfaceGravityMps2(moon) - 1.62) < 0.03, 'Moon gravity must derive from measured mass and radius');
assert.ok(displayScaledGravityMu(earth) > displayScaledGravityMu(moon), 'Earth must not use a weaker hand-tuned gravity constant than the Moon');
const atTwoRadii = inverseSquareGravityAcceleration(earth, 100);
const atFourRadii = inverseSquareGravityAcceleration(earth, 200);
assert.ok(Math.abs(atTwoRadii / atFourRadii - 4) < 1e-10, 'gravity must follow inverse-square falloff');

const solarSource = await readFile(new URL('../app/js/solar-system.js', import.meta.url), 'utf8');
assert.doesNotMatch(solarSource, /pos\.z \* scale \* 0\.3/, 'JPL orbit inclination must not be flattened');
assert.match(solarSource, /MOON_TIME_SCALE: 1/, 'moon orbit timing must not be visually accelerated');

const universeVisuals = await readFile(new URL('../app/js/universe/visuals.js', import.meta.url), 'utf8');
const spaceScene = await readFile(new URL('../app/js/space/scene.js', import.meta.url), 'utf8');
const spaceMode = await readFile(new URL('../app/js/space.js', import.meta.url), 'utf8');
assert.doesNotMatch(universeVisuals, /nebulaClouds|createNebulaCloudVolume/, 'invented random nebula cloud sprites must stay deleted');
assert.doesNotMatch(universeVisuals, /populateObservationVolume|observationSampleCount/, 'observed imagery must not be scattered into invented particle depth');
assert.doesNotMatch(universeVisuals, /CylinderGeometry\(3200/, 'the Milky Way must not render as a nearby cylinder ring');
assert.doesNotMatch(universeVisuals, /createInsideGalaxySky|SphereGeometry\(18000/, 'the Milky Way must not return to a ring-like sky shell');
assert.match(universeVisuals, /single full-frame observational panorama; no generated ring or spiral/, 'the Milky Way must use the same honest full-frame observation treatment as nebulae');
assert.match(universeVisuals, /single full-frame feathered observation; no invented volumetric geometry/, 'nebula depth limitations must remain explicit');
assert.match(universeVisuals, /data-constrained-simulation/, 'unresolved exoplanet surfaces must be simulated from catalog data');
assert.match(universeVisuals, /Sun — NASA SDO observed disk/, 'Sol must use the NASA SDO observation');
assert.match(spaceScene, /options\.includeExtendedSpace !== false/, 'extended solar and universe visuals must be optional at scene creation');
assert.match(spaceMode, /createSpaceFlightScene\(\{ includeExtendedSpace: false \}\)/, 'fresh Earth return must not initialize all extended space visuals');
assert.doesNotMatch(universeVisuals, /Math\.sqrt\(period\)/, 'catalog orbital periods must share one explicit time scale');
assert.match(universeVisuals, /unknown-coplanar-display/, 'unknown exoplanet planes must be labeled instead of randomized');

console.log(JSON.stringify({
  ok: true,
  earthSurfaceGravityMps2: surfaceGravityMps2(earth),
  moonSurfaceGravityMps2: surfaceGravityMps2(moon),
  inverseSquareRatio: atTwoRadii / atFourRadii
}, null, 2));

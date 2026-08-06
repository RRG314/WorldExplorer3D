import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('../app/js/space/runtime.js', import.meta.url), 'utf8');
const solarSource = await readFile(new URL('../app/js/solar-system.js', import.meta.url), 'utf8');
const universeVisuals = await readFile(new URL('../app/js/universe/visuals.js', import.meta.url), 'utf8');
const solarSystemInit = await readFile(new URL('../app/js/solar-system/init.js', import.meta.url), 'utf8');
const spaceScene = await readFile(new URL('../app/js/space/scene.js', import.meta.url), 'utf8');
const spaceMode = await readFile(new URL('../app/js/space.js', import.meta.url), 'utf8');

assert.doesNotMatch(runtime, /gravity-model|displayScaledGravityMu/, 'space flight must use the established compatibility gravity model');
await assert.rejects(
  access(new URL('../app/js/space/gravity-model.js', import.meta.url)),
  /ENOENT/,
  'the unused physical-gravity experiment must not ship as an orphan module'
);
assert.match(runtime, /name === 'sun'\) return 3200/, 'legacy Sun gravity tuning must remain stable');
assert.match(runtime, /name === 'earth'\) return 1800/, 'legacy Earth gravity tuning must remain stable');
assert.match(runtime, /name === 'moon'\) return 300/, 'legacy Moon gravity tuning must remain stable');
assert.doesNotMatch(runtime, /worldUp: new three\.Vector3\(0, 1, 0\)/, 'chase controls must not retain a world-up pole');
assert.match(runtime, /camera\.up\.copy\(_sfTempVec\)/, 'chase camera and controls must share the spacecraft-local frame');

assert.doesNotMatch(solarSource, /pos\.z \* scale \* 0\.3/, 'the retained JPL inclination correction must not be flattened');
assert.match(solarSource, /MOON_TIME_SCALE: 1/, 'the retained Moon timing correction must remain');

assert.match(universeVisuals, /createNebulaCloudVolume/, 'pre-experiment deep-space presentation must be restored');
assert.match(universeVisuals, /Math\.sqrt\(period\)/, 'pre-experiment catalog orbit pacing must be restored');
assert.match(universeVisuals, /Sol visuals are owned by the authoritative solar-system runtime/, 'universe frames must not create a second Sol');
assert.doesNotMatch(universeVisuals, /data-constrained-simulation|addObservedSolarDisk|sun-sdo-2025/, 'later simulated surface and duplicate-Sun experiments must stay inactive');

assert.match(solarSystemInit, /sun-sdo-2025\.jpg/, 'the retained authoritative Sun must use the NASA SDO observation');
assert.match(solarSystemInit, /MeshBasicMaterial\(\{ map: sunTexture/, 'the retained observation must map directly onto one Sun sphere');
assert.match(spaceScene, /options\.includeExtendedSpace !== false/, 'extended space must remain lazy at scene creation');
assert.match(spaceMode, /createSpaceFlightScene\(\{ includeExtendedSpace: false \}\)/, 'fresh Earth return must not initialize extended space');

console.log(JSON.stringify({
  ok: true,
  compatibilityGravity: true,
  compatibilityDeepSpace: true,
  retainedImprovements: ['axis-stable-space-controls', 'one-spherical-sun', 'lazy-extended-space', 'jpl-inclination', 'moon-time-scale']
}, null, 2));

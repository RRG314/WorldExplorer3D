import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const license = read('LICENSE');
const normalizedLicense = license.replace(/\s+/g, ' ');
const readme = read('README.md');
const attribution = read('ATTRIBUTION.md');
const acknowledgements = read('ACKNOWLEDGEMENTS.md');
const modelAttribution = read('app/assets/models/ATTRIBUTION.md');
const appShell = read('app/index.html');
const terms = read('legal/terms/index.html');

test('the package cannot be accidentally published to npm', () => {
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.license, 'SEE LICENSE IN LICENSE');
});

test('the repository declares one explicit proprietary source-available boundary', () => {
  assert.match(normalizedLicense, /SOURCE-AVAILABLE LICENSE 1\.0/);
  assert.match(normalizedLicense, /LicenseRef-World-Explorer-3D-Source-Available-1\.0/);
  assert.match(normalizedLicense, /All Rights Reserved/);
  assert.match(normalizedLicense, /Attribution alone does not grant permission/);
  assert.match(normalizedLicense, /deploy or operate Project Materials in a public, commercial, production, or hosted system/);
  assert.match(normalizedLicense, /Project Materials do not include third-party software, data, services/);
});

test('public license language and the player-facing legal surface agree', () => {
  assert.match(readme, /publicly viewable under the custom source-available terms/);
  assert.match(readme, /attribution alone does not grant permission/);
  assert.match(appShell, /proprietary source-available license/);
  assert.match(terms, /Access to the game does not transfer ownership/);
});

test('third-party credits remain linked and current', () => {
  assert.match(license, /ATTRIBUTION\.md/);
  assert.match(license, /ACKNOWLEDGEMENTS\.md/);
  assert.match(attribution, /Last reviewed: 2026-09-03 for World Explorer 3D 5\.2\.0/);
  assert.match(acknowledgements, /Last reviewed: 2026-09-03 for World Explorer 3D 5\.2\.0/);
  assert.match(attribution, /© OpenStreetMap contributors/);
  assert.match(modelAttribution, /Low Poly House Interior/);
  assert.match(modelAttribution, /paolo\.mercoglia/);
  assert.match(modelAttribution, /Creative Commons Attribution 4\.0 International/);
  assert.match(modelAttribution, /Sci-Fi Modular Gun Pack/);
  assert.match(modelAttribution, /Quaternius/);
  assert.match(modelAttribution, /Creative Commons Zero v1\.0 Universal/);
  assert.match(appShell, /Data, licenses &amp; credits/);
});

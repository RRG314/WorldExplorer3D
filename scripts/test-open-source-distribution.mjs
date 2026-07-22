import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function fail(message) {
  throw new Error(message);
}

function read(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const requiredFiles = [
  'LICENSE',
  'NOTICE',
  'THIRD_PARTY_NOTICES.md',
  'DATA_LICENSES.md',
  'MEDIA_LICENSE.md',
  'TRADEMARKS.md',
  'DCO.txt',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'app/assets/models/ATTRIBUTION.md',
  'app/assets/textures/ATTRIBUTION.md',
  'assets/landing/ATTRIBUTION.md'
];

requiredFiles.forEach(read);

assert(read('LICENSE').includes('Apache License\n                           Version 2.0'),
  'LICENSE must contain Apache License 2.0.');
assert(read('NOTICE').includes('Copyright 2026 Steven Reid'),
  'NOTICE must identify the project copyright owner.');
assert(read('CITATION.cff').includes('license: "Apache-2.0"'),
  'CITATION.cff must identify the Apache-2.0 project license.');

for (const manifestPath of [
  'package.json',
  'functions/package.json',
  'packages/mmo-contracts/package.json',
  'server/package.json'
]) {
  const manifest = JSON.parse(read(manifestPath));
  assert(manifest.license === 'Apache-2.0',
    `${manifestPath} must declare Apache-2.0.`);
}

const forbiddenFiles = [
  'app/assets/models/Astronaut.glb',
  'app/assets/models/soldier.glb',
  'assets/landing/hero.jpg'
];

for (const relativePath of forbiddenFiles) {
  assert(!fs.existsSync(path.join(root, relativePath)),
    `Unverified or replaced asset must remain absent: ${relativePath}`);
}

const landingAttribution = read('assets/landing/ATTRIBUTION.md');
const mediaLicense = read('MEDIA_LICENSE.md');
for (const transitionAsset of ['city.jpg', 'moon.jpg', 'space.jpg']) {
  assert(landingAttribution.includes(transitionAsset),
    `Transition artwork is missing provenance: ${transitionAsset}`);
  assert(mediaLicense.includes(`assets/landing/${transitionAsset}`),
    `Transition artwork is missing from MEDIA_LICENSE.md: ${transitionAsset}`);
}
assert(landingAttribution.includes('ChatGPT/GPT-4o C2PA'),
  'Generated transition artwork must retain its C2PA provenance notice.');

const publicDocs = [
  'README.md',
  'CONTRIBUTING.md',
  'GOVERNANCE.md',
  'CONTENT_EXTENSION_GUIDE.md',
  'MMO_ARCHITECTURE.md',
  'ACKNOWLEDGEMENTS.md',
  'about/index.html',
  'app/index.html'
];

for (const relativePath of publicDocs) {
  const body = read(relativePath);
  assert(!/source[- ]available|proprietary software|all rights reserved/i.test(body),
    `${relativePath} contains stale closed-source wording.`);
}

const modelAttribution = read('app/assets/models/ATTRIBUTION.md');
const modelRoot = path.join(root, 'app/assets/models');
const modelFiles = fs.readdirSync(modelRoot, { recursive: true })
  .filter((entry) => /\.(?:glb|gltf|fbx|obj)$/i.test(entry));
for (const entry of modelFiles) {
  const basename = path.basename(entry);
  assert(modelAttribution.includes(basename),
    `Bundled model is missing attribution: ${entry}`);
}

const envExample = read('functions/.env.example');
assert(/WE3D_OPENSKY_ENABLED=false/.test(envExample),
  'OpenSky must remain disabled by default in the environment template.');
assert(read('app/index.html').includes('Aircraft observations by ADSB.lol'),
  'Public runtime attribution must identify ADSB.lol as the default provider.');

console.log(`Open-source distribution checks passed (${requiredFiles.length} notices, ${modelFiles.length} models).`);

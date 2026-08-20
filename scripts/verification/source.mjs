import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBundledBuildingMetadata } from '../../app/js/world/preset-building-metadata.js';

const root = process.cwd();
const reportPath = path.join(root, 'output', 'verification', 'source', 'report.json');
const requiredFiles = [
  'index.html',
  'app/index.html',
  'app/js/bootstrap.js',
  'app/js/app-entry.js',
  'app/js/app-shell-fragments.js',
  'app/js/app-auth-shell.js',
  'app/js/runtime-diagnostics.js',
  'scripts/hosting-artifact.mjs',
  'config/verification-policy.json'
];

async function exists(filePath) {
  return fs.stat(filePath).then((stat) => stat.isFile() || stat.isDirectory()).catch(() => false);
}

async function filesUnder(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(absolute));
    if (entry.isFile()) result.push(absolute);
  }
  return result;
}

function localReference(baseFile, reference) {
  const value = String(reference || '').trim();
  if (!value || value.startsWith('#') || /^(?:[a-z]+:|\/\/)/i.test(value)) return null;
  const pathname = value.split(/[?#]/, 1)[0];
  if (!pathname) return null;
  return pathname.startsWith('/')
    ? path.join(root, pathname.slice(1))
    : path.resolve(path.dirname(baseFile), pathname);
}

async function htmlResourceFailures(filePath) {
  const html = await fs.readFile(filePath, 'utf8');
  const references = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1]);
  const failures = [];
  for (const reference of references) {
    const target = localReference(filePath, reference);
    if (target && !(await exists(target))) failures.push({ file: path.relative(root, filePath), reference });
  }
  return failures;
}

function moduleReferences(source) {
  const references = [];
  const expressions = [
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const expression of expressions) {
    for (const match of source.matchAll(expression)) references.push(match[1]);
  }
  return references;
}

const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const policy = JSON.parse(await fs.readFile(path.join(root, 'config', 'verification-policy.json'), 'utf8'));
assert.equal(policy.status, 'legacy-suite-quarantined');

const localJsonFetch = async (input) => {
  try {
    const json = JSON.parse(await fs.readFile(fileURLToPath(input), 'utf8'));
    return { ok: true, status: 200, json: async () => json };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
};
const jfxMetadataWithoutPublicationCoverage = await fetchBundledBuildingMetadata({
  fetchImpl: localJsonFetch,
  locationKey: 'custom',
  lat: 39.309728,
  lon: -76.621428
});
const jfxMetadataWithPublicationCoverage = await fetchBundledBuildingMetadata({
  coverageRadiusDegrees: 0.022,
  fetchImpl: localJsonFetch,
  locationKey: 'custom',
  lat: 39.309728,
  lon: -76.621428
});
const ruralMetadataWithPublicationCoverage = await fetchBundledBuildingMetadata({
  coverageRadiusDegrees: 0.022,
  fetchImpl: localJsonFetch,
  locationKey: 'custom',
  lat: 41.878,
  lon: -93.0977
});
const buildingMetadataCoverageFailures = [];
if (jfxMetadataWithoutPublicationCoverage !== null) {
  buildingMetadataCoverageFailures.push('JFX origin unexpectedly selects a downtown-only pack without publication coverage');
}
if (jfxMetadataWithPublicationCoverage?._buildingMetadataPackId !== 'baltimore') {
  buildingMetadataCoverageFailures.push('JFX building publication coverage does not select the intersecting Baltimore metadata pack');
}
if (jfxMetadataWithPublicationCoverage?._buildingMetadataSelection?.reason !== 'publication-coverage-intersection') {
  buildingMetadataCoverageFailures.push('JFX metadata pack selection does not record publication-coverage authority');
}
if (ruralMetadataWithPublicationCoverage !== null) {
  buildingMetadataCoverageFailures.push('rural Iowa incorrectly selects an unrelated bundled building metadata pack');
}

const missingRequiredFiles = [];
for (const relative of requiredFiles) {
  if (!(await exists(path.join(root, relative)))) missingRequiredFiles.push(relative);
}

const legacyTestFiles = (await filesUnder(path.join(root, 'scripts')))
  .map((filePath) => path.relative(root, filePath).split(path.sep).join('/'))
  .filter((name) => /(?:^|\/)test-.*\.mjs$/i.test(name));
const legacyScriptReferences = Object.entries(packageJson.scripts || {})
  .filter(([, command]) => /scripts\/test-|world-matrix|legacy-test-quarantine/i.test(String(command)))
  .map(([name, command]) => ({ name, command }));

const missingScriptTargets = [];
for (const [name, command] of Object.entries(packageJson.scripts || {})) {
  for (const match of String(command).matchAll(/\bnode\s+(scripts\/[^\s"']+\.mjs)\b/g)) {
    if (!(await exists(path.join(root, match[1])))) missingScriptTargets.push({ name, target: match[1] });
  }
}

const htmlFailures = [
  ...await htmlResourceFailures(path.join(root, 'index.html')),
  ...await htmlResourceFailures(path.join(root, 'app', 'index.html'))
];

const moduleFiles = (await filesUnder(path.join(root, 'app', 'js')))
  .filter((filePath) => filePath.endsWith('.js') || filePath.endsWith('.mjs'));
const missingModuleTargets = [];
const identitiesByTarget = new Map();
for (const importer of moduleFiles) {
  const source = await fs.readFile(importer, 'utf8');
  for (const reference of moduleReferences(source)) {
    if (!reference.startsWith('.')) continue;
    const [pathname, query = ''] = reference.split('?', 2);
    const target = path.resolve(path.dirname(importer), pathname);
    if (!(await exists(target))) {
      missingModuleTargets.push({ importer: path.relative(root, importer), reference });
      continue;
    }
    const normalized = path.relative(root, target).split(path.sep).join('/');
    if (!identitiesByTarget.has(normalized)) identitiesByTarget.set(normalized, new Set());
    identitiesByTarget.get(normalized).add(query || '(unversioned)');
  }
}
const duplicateModuleIdentities = [...identitiesByTarget.entries()]
  .filter(([, identities]) => identities.size > 1)
  .map(([target, identities]) => ({ target, identities: [...identities].sort() }));

const diagnosticsSource = await fs.readFile(path.join(root, 'app', 'js', 'runtime-diagnostics.js'), 'utf8');
const productionDebugDefaultOff = diagnosticsSource.includes("diagnosticsParams.get('diagnostics') === '1'");
const outputFiles = await filesUnder(path.join(root, 'output')).catch(() => []);
const staleGeneratedImages = outputFiles
  .map((filePath) => path.relative(root, filePath).split(path.sep).join('/'))
  .filter((relative) => /\.(?:png|jpe?g|webp)$/i.test(relative) &&
    !relative.startsWith('output/release-evidence/current/'));

const report = {
  ok: false,
  generatedAt: new Date().toISOString(),
  contract: 'current-source-and-entry-graph-health',
  policyStatus: policy.status,
  counts: {
    moduleFiles: moduleFiles.length,
    moduleTargets: identitiesByTarget.size,
    packageScripts: Object.keys(packageJson.scripts || {}).length
  },
  failures: {
    missingRequiredFiles,
    legacyTestFiles,
    legacyScriptReferences,
    missingScriptTargets,
    htmlFailures,
    missingModuleTargets,
    duplicateModuleIdentities,
    buildingMetadataCoverageFailures,
    staleGeneratedImages,
    productionDebugDefaultOff: productionDebugDefaultOff ? [] : ['runtime diagnostics are not opt-in']
  }
};
report.ok = Object.values(report.failures).every((value) => Array.isArray(value) && value.length === 0);
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.equal(report.ok, true, `Source verification failed; see ${path.relative(root, reportPath)}`);

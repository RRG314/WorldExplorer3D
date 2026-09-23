import fs from 'node:fs/promises';
import { currentContractTests } from './current-contract-list.mjs';
import { backendSteps } from './backend-steps.mjs';

const rows = await Promise.all(currentContractTests.map(async file => {
  const source = await fs.readFile(file, 'utf8');
  return { file, sourceReading: /\b(?:readFile|readFileSync)\b/.test(source),
    sourceMatchingAssertions: (source.match(/assert\.(?:match|doesNotMatch)\(/g) || []).length,
    vmExecution: /\bvm\b|runInNewContext|new Function/.test(source),
    directBrowserImport: /(?:from\s*|require\()['"]playwright/.test(source) };
}));
const all = (await fs.readdir('tests')).filter(name => /\.test\.(?:mjs|cjs|js)$/.test(name)).map(name => `tests/${name}`);
const externalOwners = new Map(backendSteps.flatMap(step => step.command.filter(arg => all.includes(arg))
  .map(file => [file, `backend:${step.id}`])));
const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (packageJson.scripts['verify:painttown'] === 'node tests/painttown.integration.test.mjs') {
  externalOwners.set('tests/painttown.integration.test.mjs', 'candidate:painttown');
}
const unselectedFiles = all.filter(file => !currentContractTests.includes(file)).sort();
const unownedFiles = unselectedFiles.filter(file => !externalOwners.has(file));
const report = { schemaVersion: 1, evidenceScope: 'Static inventory signals, not exclusive test classifications or coverage percentages',
  selectedFiles: rows.length, uniqueFiles: new Set(currentContractTests).size,
  unselectedFiles, separateGateFiles: unselectedFiles.map(file => ({ file, gate: externalOwners.get(file) || null })), unownedFiles,
  filesReadingSourceOrFixtures: rows.filter(row => row.sourceReading).length,
  filesWithMatchingAssertions: rows.filter(row => row.sourceMatchingAssertions).length,
  filesUsingVm: rows.filter(row => row.vmExecution).length,
  filesImportingBrowser: rows.filter(row => row.directBrowserImport).length, rows };
await fs.mkdir('output/verification/current-contracts', { recursive: true });
await fs.writeFile('output/verification/current-contracts/inventory.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
if (unownedFiles.length) {
  console.error('Test files are missing from both the component suite and separate release gates. Assign their execution scope explicitly.');
  process.exitCode = 1;
}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(packageJson.version || '').trim();
assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'package.json must contain a valid release version.');

const [changelog, releaseNotes, releaseWorkflow] = await Promise.all([
  fs.readFile(path.join(root, 'CHANGELOG.md'), 'utf8'),
  fs.readFile(path.join(root, `RELEASE_NOTES_${version}.md`), 'utf8'),
  fs.readFile(path.join(root, '.github', 'workflows', 'release-verify.yml'), 'utf8')
]);

assert.match(
  changelog,
  new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm'),
  `CHANGELOG.md must contain a dated ${version} release entry.`
);
assert.equal(
  releaseNotes.split(/\r?\n/, 1)[0],
  `# World Explorer 3D ${version}`,
  `RELEASE_NOTES_${version}.md must begin with the exact product version.`
);
assert.match(
  releaseWorkflow,
  /name:\s*worldexplorer3d-\$\{\{\s*steps\.package-version\.outputs\.version\s*\}\}-\$\{\{\s*github\.sha\s*\}\}/,
  'The release workflow artifact name must derive from package.json instead of a hard-coded version.'
);
assert.doesNotMatch(
  releaseWorkflow,
  /name:\s*worldexplorer3d-\d+\.\d+\.\d+-\$\{\{\s*github\.sha\s*\}\}/,
  'The release workflow must not retain a hard-coded artifact version.'
);

console.log(JSON.stringify({
  ok: true,
  product: packageJson.name,
  version,
  releaseNotes: `RELEASE_NOTES_${version}.md`
}, null, 2));

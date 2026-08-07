import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const outputLabel = /^[a-z0-9._-]+$/i.test(
  String(process.env.WORLD_MATRIX_OUTPUT_LABEL || '')
) ? String(process.env.WORLD_MATRIX_OUTPUT_LABEL) : '';
const outputDir = path.join(
  rootDir,
  'output',
  'playwright',
  'world-matrix',
  outputLabel
);
const reviewer = String(process.env.WORLD_MATRIX_REVIEWER || '').trim();
const approved = process.argv.includes('--approve');
const target = path.resolve(
  rootDir,
  process.env.WORLD_MATRIX_VISUAL_REVIEW_FILE ||
    path.join(outputDir, 'visual-review.json')
);

if (approved && !reviewer) {
  throw new Error('WORLD_MATRIX_REVIEWER is required with --approve');
}

const entries = await fs.readdir(outputDir, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
  .map((entry) => entry.name)
  .sort();

if (files.length === 0) {
  throw new Error(`No world-matrix screenshots found in ${outputDir}`);
}

const decisions = [];
for (const file of files) {
  const bytes = await fs.readFile(path.join(outputDir, file));
  decisions.push({
    file,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    outcome: approved ? 'approved' : 'pending',
    notes: approved ? 'Visually inspected against the 4.1.3 release checklist.' : ''
  });
}

const manifest = {
  schemaVersion: 1,
  reviewer: reviewer || 'PENDING REVIEWER',
  reviewedAt: new Date().toISOString(),
  decisions
};
await fs.writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ok: true,
  approved,
  reviewer: manifest.reviewer,
  screenshotCount: files.length,
  manifestPath: target
}, null, 2));

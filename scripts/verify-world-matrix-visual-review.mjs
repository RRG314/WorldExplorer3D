import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyVisualReview } from './production-readiness.mjs';

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
const manifestPath = String(
  process.env.WORLD_MATRIX_VISUAL_REVIEW_FILE || ''
).trim();

const entries = await fs.readdir(outputDir, { withFileTypes: true });
const expectedFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
  .map((entry) => path.join(outputDir, entry.name))
  .sort();

if (expectedFiles.length === 0) {
  throw new Error(`No world-matrix screenshots found in ${outputDir}`);
}

const result = await verifyVisualReview({
  manifestPath: manifestPath ? path.resolve(rootDir, manifestPath) : '',
  outputDir,
  expectedFiles
});

console.log(JSON.stringify({
  outputDir,
  screenshotCount: expectedFiles.length,
  visualReview: result
}, null, 2));

if (!result.approved) {
  throw new Error(
    `World-matrix visual review is not approved: ${result.reason}`
  );
}

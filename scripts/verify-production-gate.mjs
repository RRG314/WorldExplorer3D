import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyVisualReview } from './production-readiness.mjs';

const rootDir = process.cwd();
const outputLabel = /^[a-z0-9._-]+$/i.test(
  String(process.env.WORLD_MATRIX_OUTPUT_LABEL || '')
) ? String(process.env.WORLD_MATRIX_OUTPUT_LABEL) : '';
const worldMatrixDir = path.join(
  rootDir,
  'output',
  'playwright',
  'world-matrix',
  outputLabel
);
const visualReviewFile = String(
  process.env.WORLD_MATRIX_VISUAL_REVIEW_FILE || ''
).trim();

async function readReport(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      readError: `${label} report is missing or invalid: ${error.message}`
    };
  }
}

const runtime = await readReport(
  path.join(rootDir, 'output', 'playwright', 'runtime-invariants', 'report.json'),
  'Runtime invariants'
);
const playerDrive = await readReport(
  path.join(rootDir, 'output', 'playwright', 'player-input-drive', 'report.json'),
  'Real-input drive'
);
const worldMatrix = await readReport(
  path.join(worldMatrixDir, 'report.json'),
  'World matrix'
);

const screenshotEntries = await fs.readdir(worldMatrixDir, {
  withFileTypes: true
}).catch(() => []);
const screenshots = screenshotEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
  .map((entry) => path.join(worldMatrixDir, entry.name))
  .sort();
const visualReview = await verifyVisualReview({
  manifestPath: visualReviewFile ?
    path.resolve(rootDir, visualReviewFile) :
    '',
  outputDir: worldMatrixDir,
  expectedFiles: screenshots
});

const checks = {
  runtimeReady: runtime.ok === true,
  realInputDrivePassed:
    playerDrive.ok === true &&
    playerDrive.evidence?.realInput === true &&
    Number(playerDrive.wallClockSeconds) >= 600 &&
    playerDrive.gpu?.softwareRenderer === false,
  worldMatrixAutomatedPassed: worldMatrix.automatedPass === true,
  screenshotsPresent: screenshots.length > 0,
  visualReviewApproved: visualReview.approved === true
};
const ok = Object.values(checks).every(Boolean);
const result = {
  ok,
  generatedAt: new Date().toISOString(),
  checks,
  evidence: {
    runtimeReport: 'output/playwright/runtime-invariants/report.json',
    playerDriveReport: 'output/playwright/player-input-drive/report.json',
    worldMatrixReport: path.relative(
      rootDir,
      path.join(worldMatrixDir, 'report.json')
    ),
    screenshotCount: screenshots.length,
    reportErrors: [
      runtime.readError,
      playerDrive.readError,
      worldMatrix.readError
    ].filter(Boolean),
    visualReview
  }
};
console.log(JSON.stringify(result, null, 2));

if (!ok) {
  const failed = Object.entries(checks)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  throw new Error(`Production gate failed: ${failed.join(', ')}`);
}

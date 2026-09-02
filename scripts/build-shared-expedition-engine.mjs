import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'functions', 'generated');
const outputFile = path.join(outputDir, 'expedition-command-engine.cjs');

await mkdir(outputDir, { recursive: true });
await build({
  entryPoints: [path.join(root, 'app', 'js', 'expedition', 'command-authority.js')],
  outfile: outputFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node20'],
  sourcemap: false,
  legalComments: 'none',
  banner: { js: "'use strict';\n// Generated from the browser's Expedition rules. Run npm run build:shared-expedition-engine after changing those rules." }
});

import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'functions', 'generated');
const outputFile = path.join(outputDir, 'weekly-room-model.cjs');

export async function buildWeeklyRoomModel({ write = true } = {}) {
if (write) await mkdir(outputDir, { recursive: true });
return build({
  write,
  absWorkingDir: root,
  entryPoints: [path.join(root, 'app', 'js', 'multiplayer', 'featured-city-model.js')],
  outfile: outputFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node20'],
  sourcemap: false,
  legalComments: 'none',
  banner: { js: "'use strict';\n// Generated from canonical weekly room facts. Run node scripts/build-weekly-room-model.mjs after changing those facts." }
});
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await buildWeeklyRoomModel();

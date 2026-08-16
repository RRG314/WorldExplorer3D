#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const localPython = path.resolve('.datum-venv/bin/python');
const python = process.env.WE3D_DATUM_PYTHON ||
  (fs.existsSync(localPython) ? localPython : 'python3');
const result = spawnSync(
  python,
  ['scripts/ground-datum-normalizer.py', ...process.argv.slice(2)],
  { stdio: 'inherit' }
);
if (result.error) {
  console.error(JSON.stringify({
    ok: false,
    error:
      `unable to run ${python}; create .datum-venv with ` +
      'scripts/ground-datum-requirements.txt'
  }, null, 2));
  process.exit(1);
}
process.exit(result.status ?? 1);

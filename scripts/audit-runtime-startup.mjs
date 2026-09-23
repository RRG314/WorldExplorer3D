import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Source reachability, not a CPU/RAM measurement. Resolve real ES imports
// rather than treating every shipped file or every dynamic import as boot work.
const entry = 'app/js/app-entry.js';
const result = await build({
  entryPoints: [entry], bundle: true, write: false, metafile: true,
  format: 'esm', platform: 'browser', splitting: true, treeShaking: false,
  outdir: 'output/runtime-audit-not-written', external: ['https://*', 'http://*'],
  logLevel: 'silent'
});
const inputs = result.metafile.inputs;
const eager = new Set(), pending = [entry];
while (pending.length) {
  const file = pending.pop();
  if (eager.has(file)) continue;
  eager.add(file);
  for (const dependency of inputs[file]?.imports || []) {
    if (!dependency.external && dependency.kind !== 'dynamic-import') pending.push(dependency.path);
  }
}
const records = Object.entries(inputs).map(([file, info]) => ({
  file, bytes: info.bytes, eager: eager.has(file)
}));
const duplicateIdentities = Object.entries(Object.groupBy(records, record => record.file.split('?')[0]))
  .filter(([, entries]) => entries.length > 1)
  .map(([file, entries]) => ({ file, identities: entries.map(entry => entry.file) }));
const report = {
  checkedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  evidenceScope: 'Resolved application ES-module source graph; bytes are uncompressed source, not network transfer, heap, GPU memory or execution time. Classic vendors are separate.',
  entry,
  eager: { modules: eager.size, bytes: records.filter(record => record.eager).reduce((sum, record) => sum + record.bytes, 0) },
  deferred: { modules: records.filter(record => !record.eager).length, bytes: records.filter(record => !record.eager).reduce((sum, record) => sum + record.bytes, 0) },
  verificationModulesInRuntime: records.filter(record => record.file.startsWith('scripts/verification/') || record.file.includes('playwright')),
  duplicateIdentities,
  largestEager: records.filter(record => record.eager).sort((a, b) => b.bytes - a.bytes).slice(0, 25),
  records
};
const output = path.resolve('output/verification/runtime-startup/report.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, records: undefined }, null, 2));
if (report.verificationModulesInRuntime.length || duplicateIdentities.length) process.exitCode = 1;

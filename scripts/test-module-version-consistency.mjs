import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('app/js');
const importPattern = /(?:\bfrom\s*|\bimport\s*\()\s*['"]([^'"]+)['"]/g;

async function collectJavaScriptFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectJavaScriptFiles(target));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(target);
  }
  return files;
}

const importsByTarget = new Map();
for (const importer of await collectJavaScriptFiles(root)) {
  const source = await fs.readFile(importer, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const [relativeTarget, query = ''] = specifier.split('?');
    const resolved = path.resolve(path.dirname(importer), relativeTarget);
    if (!resolved.startsWith(root) || !resolved.endsWith('.js')) continue;
    const records = importsByTarget.get(resolved) || [];
    records.push({
      importer: path.relative(process.cwd(), importer),
      specifier,
      version: query || '<none>'
    });
    importsByTarget.set(resolved, records);
  }
}

const conflicts = [];
for (const [target, records] of importsByTarget) {
  const versions = new Set(records.map((record) => record.version));
  if (versions.size > 1) {
    conflicts.push({ target: path.relative(process.cwd(), target), versions: [...versions].sort(), records });
  }
}

if (conflicts.length > 0) {
  console.error(JSON.stringify({ ok: false, conflictCount: conflicts.length, conflicts }, null, 2));
  process.exit(1);
}

const firebaseConfig = JSON.parse(await fs.readFile(path.resolve('firebase.json'), 'utf8'));
const hostingHeaders = firebaseConfig?.hosting?.headers || [];
const codeHeader = hostingHeaders.find((entry) => String(entry?.source || '').includes('js|css'));
const mediaHeader = hostingHeaders.find((entry) => String(entry?.source || '').includes('jpg|jpeg'));
const htmlHeader = hostingHeaders.find((entry) => String(entry?.source || '').includes('*.html'));
const cacheValue = (entry) => String(entry?.headers?.find((header) => header?.key === 'Cache-Control')?.value || '').toLowerCase();
if (
  !cacheValue(codeHeader).includes('must-revalidate') ||
  !cacheValue(mediaHeader).includes('must-revalidate') ||
  !cacheValue(htmlHeader).includes('must-revalidate')
) {
  console.error(JSON.stringify({
    ok: false,
    reason: 'Unhashed code, HTML, fonts, models, and media must revalidate so deployments cannot mix generations.'
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checkedTargets: importsByTarget.size,
  message: 'Every local ES module has one runtime URL identity and every unhashed hosted asset class revalidates.'
}, null, 2));

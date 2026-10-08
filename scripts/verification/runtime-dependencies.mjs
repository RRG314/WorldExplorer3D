import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';
import { build } from 'esbuild';
import { buildSharedExpeditionEngine } from '../build-shared-expedition-engine.mjs';

const shippedRoots = ['app', 'js', 'account', 'about', 'assets', 'legal', 'styles'];
export function codeReferences(source, extension = '.js') {
  const values = [], executable = [];
  if (extension === '.html') {
    for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const src = match[1].match(/\bsrc\s*=\s*['"]([^'"]+)['"]/i);
      if (src) executable.push(src[1]);
      else if (!/\btype\s*=\s*['"](?:application\/ld\+json|application\/json|importmap)['"]/i.test(match[1])) executable.push(...codeReferences(match[2]));
      else if (/\bimportmap\b/i.test(match[1])) {
        const map = JSON.parse(match[2]);
        executable.push(...Object.values(map.imports || {}), ...Object.values(map.scopes || {}).flatMap(Object.values));
      }
    }
  } else {
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'StringLiteral') values.push(node.value);
      if (node.type === 'TemplateElement') values.push(node.value.cooked || node.value.raw);
      if (['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration','ImportExpression'].includes(node.type) && node.source?.value) executable.push(node.source.value);
      for (const [key, value] of Object.entries(node)) {
        if (key === 'loc' || key === 'comments' || key === 'tokens') continue;
        if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
      }
    };
    visit(parse(source, { sourceType: 'unambiguous' }));
  }
  return [...new Set([...executable.filter(value => /^https?:\/\//.test(value)), ...values.filter(value => /^https?:\/\//.test(value) &&
    ( /\.(?:m?js)(?:[?#].*)?$/.test(value) || /\/\+esm$/.test(value) ||
      /^https?:\/\/cdn\.jsdelivr\.net\/npm\//.test(value)))])].sort();
}
export async function collectRuntimeCodeReferences(root = process.cwd()) {
  const files = [...new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))];
  const references = new Map();
  for (const file of files.sort()) {
    if ((!shippedRoots.includes(file.split('/')[0]) && !['index.html', 'about.html'].includes(file)) ||
        file.includes('/vendor/') || !/\.(?:js|mjs|cjs|html)$/.test(file)) continue;
    for (const url of codeReferences(await readFile(path.join(root, file), 'utf8'), path.extname(file))) {
      if (!references.has(url)) references.set(url, []);
      references.get(url).push(file);
    }
  }
  return [...references].sort(([a], [b]) => a.localeCompare(b)).map(([url, consumers]) => ({ url, consumers }));
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function verifyRuntimeDependencies(root = process.cwd()) {
  const inventory = JSON.parse(await readFile(path.join(root, 'config/runtime-dependencies.json'), 'utf8'));
  const failures = [];
  const references = await collectRuntimeCodeReferences(root);
  if (inventory.schemaVersion !== 1) failures.push('Unknown runtime dependency inventory version');
  const actual = JSON.stringify(references);
  const expected = JSON.stringify(inventory.external.map(({ url, consumers }) => ({ url, consumers })).sort((a,b)=>a.url.localeCompare(b.url)));
  if (actual !== expected) failures.push('External executable URLs or consumers differ from the reviewed inventory');
  for (const entry of inventory.external) {
    if (!entry.version || !entry.owner || !entry.availability || !entry.provenance || !/^https:\/\//.test(entry.url)) failures.push(`Incomplete policy: ${entry.url}`);
  }
  for (const lock of inventory.locks) {
    if (sha256(await readFile(path.join(root, lock.path))) !== lock.sha256) failures.push(`Lockfile changed: ${lock.path}`);
    const packages = JSON.parse(await readFile(path.join(root, lock.path), 'utf8')).packages;
    for (const dependency of lock.direct) {
      const resolved = packages[`node_modules/${dependency.package}`];
      if (resolved?.version !== dependency.version || resolved?.integrity !== dependency.integrity) failures.push(`Locked provenance differs: ${lock.path}:${dependency.package}`);
    }
  }
  const reviewedFiles = new Set();
  for (const dependency of inventory.local) for (const file of dependency.files) {
    reviewedFiles.add(file.path);
    const bytes = await readFile(path.join(root, file.path));
    if (sha256(bytes) !== file.sha256) failures.push(`Vendor bytes changed: ${file.path}`);
    if (file.source && !bytes.equals(await readFile(path.join(root, 'node_modules', dependency.package, file.source)))) failures.push(`Vendor differs from installed locked source: ${file.path}`);
  }
  const walk = async directory => {
    for (const item of await readdir(path.join(root,directory), { withFileTypes:true })) {
      const relative = `${directory}/${item.name}`;
      if (item.isDirectory()) await walk(relative);
      else if (!reviewedFiles.has(relative)) failures.push(`Unreviewed vendor file: ${relative}`);
    }
  };
  await walk('app/vendor');
  for (const [packageName, entry, file] of [['exifr','dist/full.esm.mjs','exifr'],['qrcode','lib/browser.js','qrcode']]) {
    const built = await build({ absWorkingDir:root, entryPoints:[`node_modules/${packageName}/${entry}`],bundle:true,format:'esm',platform:'browser',minify:true,write:false });
    if (!Buffer.from(built.outputFiles[0].contents).equals(await readFile(path.join(root,`app/vendor/${file}/${file}.js`)))) failures.push(`Regenerated ${packageName} differs from the shipped vendor`);
  }
  for (const file of inventory.local.find(entry=>entry.package==='manifold-3d').files) {
    if (!Buffer.from(await readFile(path.join(root,`node_modules/manifold-3d/${path.basename(file.path)}`))).equals(await readFile(path.join(root,file.path)))) failures.push(`Manifold differs from locked source: ${file.path}`);
  }
  const generated = await buildSharedExpeditionEngine({write:false});
  if (!Buffer.from(generated.outputFiles[0].contents).equals(await readFile(path.join(root,'functions/generated/expedition-command-engine.cjs')))) failures.push('Shared Expedition rules must be regenerated from the current browser authority');
  return { schemaVersion:1, ok:!failures.length, external:references.length, localFiles:reviewedFiles.size, failures };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await verifyRuntimeDependencies();
  console.log(JSON.stringify(report,null,2));
  if (!report.ok) process.exitCode=1;
}

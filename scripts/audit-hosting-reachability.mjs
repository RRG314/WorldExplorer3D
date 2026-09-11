#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ENTRIES = [
  'about.html',
  'index.html',
  'about',
  'account',
  'app',
  'assets',
  'js',
  'legal',
  'styles',
  'favicon.svg'
];
const REPORT_EXTENSIONS = new Set(['.js', '.css']);
const DECLARED_RUNTIME_ENTRIES = ['app/js/app-entry.js'];
const DECLARED_BUILD_INPUTS = ['app/js/expedition/command-authority.js'];
const strict = process.argv.includes('--strict');

function normalize(value) {
  return value.split(path.sep).join('/');
}

async function listFiles(directory, base = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = base ? path.join(base, entry.name) : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute, relative));
    else if (entry.isFile()) files.push(normalize(relative));
  }
  return files;
}

async function sourceFiles() {
  const files = new Set();
  for (const entry of SOURCE_ENTRIES) {
    const absolute = path.join(ROOT, entry);
    const stat = await fs.stat(absolute);
    if (stat.isFile()) {
      files.add(normalize(entry));
      continue;
    }
    for (const relative of await listFiles(absolute)) {
      files.add(normalize(path.join(entry, relative)));
    }
  }
  return files;
}

function resolveReference(importer, rawReference, available) {
  const cleaned = String(rawReference || '').trim().replace(/^['"]|['"]$/g, '');
  if (!cleaned || /^(?:[a-z]+:|#|\/\/)/i.test(cleaned)) return null;
  const withoutSuffix = cleaned.split(/[?#]/, 1)[0];
  if (!withoutSuffix || withoutSuffix.includes('${')) return null;
  const candidate = withoutSuffix.startsWith('/')
    ? withoutSuffix.slice(1)
    : normalize(path.join(path.dirname(importer), withoutSuffix));
  const normalized = normalize(path.normalize(candidate)).replace(/^\.\//, '');
  if (normalized.startsWith('../')) return null;
  if (available.has(normalized)) return normalized;
  if (available.has(`${normalized}.js`)) return `${normalized}.js`;
  if (available.has(`${normalized}/index.html`)) return `${normalized}/index.html`;
  return null;
}

function extractReferences(file, source) {
  const extension = path.extname(file).toLowerCase();
  const patterns = [];
  if (extension === '.html') {
    patterns.push(/<(?:script|img|source)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi);
    patterns.push(/<link\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi);
    patterns.push(/(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']/g);
    patterns.push(/import\(\s*["']([^"']+)["']\s*\)/g);
  } else if (extension === '.js' || extension === '.mjs') {
    patterns.push(/(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']/g);
    patterns.push(/import\(\s*["']([^"']+)["']\s*\)/g);
    patterns.push(/\bmoduleEntrypoint\s*=\s*[`"']([^`"']+)[`"']/g);
    patterns.push(/new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g);
    patterns.push(/fetch\(\s*["']([^"']+)["']/g);
    patterns.push(/\b(?:href|src)\s*=\s*["']([^"']+)["']/g);
  } else if (extension === '.css') {
    patterns.push(/url\(\s*["']?([^"')]+)["']?\s*\)/g);
    patterns.push(/@import\s+["']([^"']+)["']/g);
  }

  const references = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) references.push(match[1]);
  }
  return references;
}

const available = await sourceFiles();
const htmlEntries = [...available].filter((file) => path.extname(file).toLowerCase() === '.html');
const entrypoints = [...htmlEntries, ...DECLARED_RUNTIME_ENTRIES, ...DECLARED_BUILD_INPUTS];
const reached = new Set(entrypoints);
const pending = [...entrypoints];

while (pending.length > 0) {
  const file = pending.shift();
  const extension = path.extname(file).toLowerCase();
  if (!['.html', '.js', '.mjs', '.css'].includes(extension)) continue;
  const source = await fs.readFile(path.join(ROOT, file), 'utf8');
  for (const reference of extractReferences(file, source)) {
    const resolved = resolveReference(file, reference, available);
    if (!resolved || reached.has(resolved)) continue;
    reached.add(resolved);
    pending.push(resolved);
  }
}

const reportable = [...available]
  .filter((file) => REPORT_EXTENSIONS.has(path.extname(file).toLowerCase()))
  .sort();
const orphans = reportable.filter((file) => !reached.has(file));
const result = {
  ok: !strict || orphans.length === 0,
  entrypoints: entrypoints.length,
  reportableFiles: reportable.length,
  reachableFiles: reportable.length - orphans.length,
  orphanFiles: orphans
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);

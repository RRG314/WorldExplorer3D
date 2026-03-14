import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const syncEntries = [
  { source: 'index.html', target: 'public/index.html', type: 'file' },
  { source: 'account/index.html', target: 'public/account/index.html', type: 'file' },
  { source: 'app/index.html', target: 'public/app/index.html', type: 'file' },
  { source: 'app/assets', target: 'public/app/assets', type: 'dir' },
  { source: 'app/data', target: 'public/app/data', type: 'dir' },
  { source: 'app/js', target: 'public/app/js', type: 'dir' }
];

function normalizeRel(relPath) {
  return relPath.split(path.sep).join('/');
}

async function walkFiles(dir) {
  const out = [];
  async function walk(current, base = '') {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const rel = base ? path.join(base, entry.name) : entry.name;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile()) {
        out.push(normalizeRel(rel));
      }
    }
  }
  await walk(dir);
  return out;
}

async function ensureDirForFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function copyFile(sourceFile, targetFile) {
  await ensureDirForFile(targetFile);
  await fs.copyFile(sourceFile, targetFile);
}

async function copyDirRecursive(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  const files = await walkFiles(sourceDir);
  for (const rel of files) {
    const src = path.join(sourceDir, rel);
    const dst = path.join(targetDir, rel);
    await copyFile(src, dst);
  }
  return files;
}

async function removeStaleFiles(targetDir, validFilesSet) {
  const existing = await walkFiles(targetDir);
  let removed = 0;
  for (const rel of existing) {
    if (!validFilesSet.has(rel)) {
      await fs.rm(path.join(targetDir, rel), { force: true });
      removed += 1;
    }
  }
  return removed;
}

async function main() {
  const copied = [];
  let staleRemoved = 0;

  for (const entry of syncEntries) {
    const srcPath = path.join(rootDir, entry.source);
    const dstPath = path.join(rootDir, entry.target);

    if (entry.type === 'file') {
      await copyFile(srcPath, dstPath);
      copied.push(normalizeRel(entry.source));
      continue;
    }

    if (entry.type === 'dir') {
      const relFiles = await copyDirRecursive(srcPath, dstPath);
      for (const rel of relFiles) copied.push(normalizeRel(path.join(entry.source, rel)));
      staleRemoved += await removeStaleFiles(dstPath, new Set(relFiles.map(normalizeRel)));
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        copiedFiles: copied.length,
        staleFilesRemoved: staleRemoved,
        targets: syncEntries.map((entry) => ({
          source: entry.source,
          target: entry.target,
          type: entry.type
        }))
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('[sync-public-app] Failed:', err?.stack || err?.message || String(err));
  process.exit(1);
});

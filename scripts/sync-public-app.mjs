import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const sourceAppDir = path.join(rootDir, 'app');
const targetAppDir = path.join(rootDir, 'public', 'app');

const sourceItems = [
  { rel: 'index.html', type: 'file' },
  { rel: 'js', type: 'dir' }
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

  for (const item of sourceItems) {
    const srcPath = path.join(sourceAppDir, item.rel);
    const dstPath = path.join(targetAppDir, item.rel);

    if (item.type === 'file') {
      await copyFile(srcPath, dstPath);
      copied.push(normalizeRel(item.rel));
      continue;
    }

    if (item.type === 'dir') {
      const relFiles = await copyDirRecursive(srcPath, dstPath);
      for (const rel of relFiles) copied.push(normalizeRel(path.join(item.rel, rel)));
    }
  }

  const validInTarget = new Set(copied);
  let staleRemoved = 0;

  for (const item of sourceItems) {
    if (item.type !== 'dir') continue;
    const targetDir = path.join(targetAppDir, item.rel);
    const subsetValid = new Set(
      Array.from(validInTarget)
      .filter((rel) => rel.startsWith(`${normalizeRel(item.rel)}/`))
      .map((rel) => rel.slice(normalizeRel(item.rel).length + 1))
    );
    staleRemoved += await removeStaleFiles(targetDir, subsetValid);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        copiedFiles: copied.length,
        staleFilesRemoved: staleRemoved,
        source: 'app',
        target: 'public/app'
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

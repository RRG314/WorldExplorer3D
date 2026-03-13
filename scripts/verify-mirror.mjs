import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const rootDir = process.cwd();
const pairs = [
  { a: 'app/index.html', b: 'public/app/index.html' },
  { a: 'app/assets', b: 'public/app/assets', dir: true },
  { a: 'app/data', b: 'public/app/data', dir: true },
  { a: 'app/js', b: 'public/app/js', dir: true }
];

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function normalizeRel(relPath) {
  return relPath.split(path.sep).join('/');
}

async function listFilesRecursive(dir) {
  const out = [];
  async function walk(current, base = '') {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const rel = base ? path.join(base, entry.name) : entry.name;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full, rel);
      else if (entry.isFile()) out.push(normalizeRel(rel));
    }
  }
  await walk(dir);
  out.sort();
  return out;
}

async function compareFile(aPath, bPath, relLabel, mismatches) {
  try {
    const [aBuf, bBuf] = await Promise.all([fs.readFile(aPath), fs.readFile(bPath)]);
    const aHash = sha1(aBuf);
    const bHash = sha1(bBuf);
    if (aHash !== bHash) {
      mismatches.push({ kind: 'content', rel: relLabel, aHash, bHash });
    }
  } catch (err) {
    mismatches.push({ kind: 'io', rel: relLabel, error: err?.message || String(err) });
  }
}

async function main() {
  const mismatches = [];
  let checkedFiles = 0;

  for (const pair of pairs) {
    const aPath = path.join(rootDir, pair.a);
    const bPath = path.join(rootDir, pair.b);

    if (!pair.dir) {
      checkedFiles += 1;
      await compareFile(aPath, bPath, pair.a, mismatches);
      continue;
    }

    const [aFiles, bFiles] = await Promise.all([listFilesRecursive(aPath), listFilesRecursive(bPath)]);
    const all = new Set([...aFiles, ...bFiles]);

    for (const rel of Array.from(all).sort()) {
      const inA = aFiles.includes(rel);
      const inB = bFiles.includes(rel);
      if (!inA || !inB) {
        mismatches.push({ kind: 'missing', rel: `${pair.a}/${rel}`, missingIn: inA ? pair.b : pair.a });
        continue;
      }
      checkedFiles += 1;
      await compareFile(path.join(aPath, rel), path.join(bPath, rel), `${pair.a}/${rel}`, mismatches);
    }
  }

  if (mismatches.length > 0) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          checkedFiles,
          mismatchCount: mismatches.length,
          mismatches: mismatches.slice(0, 120)
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, checkedFiles, mismatchCount: 0 }, null, 2));
}

main().catch((err) => {
  console.error('[verify-mirror] Failed:', err?.stack || err?.message || String(err));
  process.exit(1);
});

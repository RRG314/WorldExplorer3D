import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readFileSync, readSync, readdirSync } from 'node:fs';
import path from 'node:path';

const digest = value => createHash('sha256').update(value).digest('hex');
const chunk = Buffer.allocUnsafe(1024 * 1024);
// Process-local only: no persisted cache can assert that different bytes passed.
// ctime/inode also invalidate replacement or edits with a restored mtime.
const cache = new Map();
function fileHash(file, stat) {
  const signature = [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, stat.mode].join(':');
  const previous = cache.get(file);
  if (previous?.signature === signature) return previous.hash;
  const hash = createHash('sha256'), fd = openSync(file, 'r');
  try { let count; while ((count = readSync(fd, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, count)); }
  finally { closeSync(fd); }
  const result = hash.digest('hex'); cache.set(file, { signature, hash: result });
  return result;
}

export function artifactIdentity(root, artifactRoot = process.env.WE3D_VERIFY_ROOT || 'dist') {
  try {
    const directory = path.resolve(root, artifactRoot);
    const buildBytes = readFileSync(path.join(directory, 'build-manifest.json'));
    const assetBytes = readFileSync(path.join(directory, 'asset-manifest.json'));
    JSON.parse(buildBytes);
    const expected = JSON.parse(assetBytes).files;
    if (!expected || typeof expected !== 'object' || Array.isArray(expected)) return null;
    const found = [];
    function visit(relative = '') {
      for (const name of readdirSync(path.join(directory, relative)).sort()) {
        const item = relative ? `${relative}/${name}` : name;
        const absolute = path.join(directory, item), stat = lstatSync(absolute, { bigint: true });
        if (stat.isSymbolicLink()) throw new Error('Artifact symlink is not immutable');
        if (stat.isDirectory()) { visit(item); continue; }
        if (!stat.isFile()) throw new Error('Unsupported artifact entry');
        if (item === 'build-manifest.json' || item === 'asset-manifest.json') continue;
        if (!Object.hasOwn(expected, item) || !/^[a-f0-9]{64}$/.test(expected[item])) throw new Error('Unexpected artifact entry');
        const actual = fileHash(absolute, stat);
        if (actual !== expected[item]) throw new Error('Changed artifact bytes');
        found.push([item, actual]);
      }
    }
    visit(); found.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    if (found.length !== Object.keys(expected).length) return null;
    return { buildManifestSha256: digest(buildBytes), assetManifestSha256: digest(assetBytes),
      verifiedContentSha256: digest(JSON.stringify(found)), fileCount: found.length };
  } catch { return null; }
}

export function sameArtifactIdentity(left, right) {
  return !!left && !!right && ['buildManifestSha256', 'assetManifestSha256', 'verifiedContentSha256'].every(key =>
    /^[a-f0-9]{64}$/.test(left[key] || '') && left[key] === right[key]);
}

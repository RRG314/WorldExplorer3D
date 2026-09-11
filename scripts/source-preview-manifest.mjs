import fs from 'node:fs/promises';
import path from 'node:path';

export const MUTABLE_SOURCE_PREVIEW_MANIFEST = Object.freeze({
  schemaVersion: 0,
  previewMode: 'mutable-source',
  candidateId: null
});

export async function serveMutableSourceManifest({ pathname, rootDir, response }) {
  if (pathname !== '/build-manifest.json') return false;
  try {
    await fs.access(path.join(rootDir, 'build-manifest.json'));
    return false;
  } catch {
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify(MUTABLE_SOURCE_PREVIEW_MANIFEST));
    return true;
  }
}

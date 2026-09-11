import { mkdir, copyFile } from 'node:fs/promises';
// Reproducible local runtime dependency; never fetched from a CDN in a session.
const target = new URL('../app/vendor/manifold/', import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ['manifold.js', 'manifold.wasm', 'LICENSE']) {
  await copyFile(new URL(`../node_modules/manifold-3d/${name}`, import.meta.url), new URL(name, target));
}

import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'config/runtime-dependencies.json'), 'utf8'));
const dependency = manifest.local.find(entry => entry.package === 'three');
const installed = JSON.parse(await readFile(path.join(root, 'node_modules/three/package.json'), 'utf8'));
if (installed.version !== dependency.version) throw new Error('Three.js version must match the reviewed runtime inventory.');
for (const file of dependency.files) {
  await mkdir(path.dirname(path.join(root, file.path)), { recursive: true });
  await copyFile(path.join(root, 'node_modules/three', file.source), path.join(root, file.path));
}
console.log(`Copied ${dependency.files.length} unchanged Three.js ${dependency.version} files. Run verify:dependencies before committing.`);

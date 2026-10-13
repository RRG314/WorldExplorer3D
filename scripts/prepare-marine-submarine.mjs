import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup, prune, weld, simplify, getBounds} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// The source is the author's downloadable 1K GLB, never a runtime dependency.
const source = process.argv[2];
if (!source) throw new Error('Pass the downloaded Atlantic Explorer submarine GLB.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const original = await readFile(source);
if (hash(original) !== '6be0aa5488c98b641efbd0e208e4f3eae5088df05ff624c1ecabf548ee0f4af0') {
  throw new Error('Source differs from the reviewed 1K author download.');
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.readBinary(original);
const root = document.getRoot();
const base = new Set(root.listMaterials().map(m => m.getBaseColorTexture()).filter(Boolean));
const transparent = new Set(root.listMaterials().filter(m => m.getAlphaMode() !== 'OPAQUE').map(m => m.getBaseColorTexture()));
for (const texture of root.listTextures()) {
  const edge = base.has(texture) ? 1024 : 512;
  const pipeline = sharp(texture.getImage()).resize(edge, edge, {fit: 'inside', withoutEnlargement: true});
  const jpeg = base.has(texture) && !transparent.has(texture);
  texture.setImage(await (jpeg ? pipeline.removeAlpha().jpeg({quality: 92, chromaSubsampling: '4:4:4'}) : pipeline.png()).toBuffer());
  texture.setMimeType(jpeg ? 'image/jpeg' : 'image/png');
}
await MeshoptSimplifier.ready;
await document.transform(weld(), simplify({simplifier: MeshoptSimplifier, ratio: .55, error: .0008}), dedup(), prune());
const bytes = await io.writeBinary(document);
const primitives = root.listMeshes().flatMap(m => m.listPrimitives());
const triangles = primitives.reduce((sum,p) => sum + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
const record = {
  schemaVersion: 1, assetId: 'marine-atlantic-explorer-submarine',
  sourceUrl: 'https://sketchfab.com/3d-models/atlantic-explorer-submarineglb-f1645a6ec3b54e81aed7b2c105cdd6e2',
  attribution: 'Atlantic Explorer Submarine by JosephWPugsley', license: 'CC-BY-4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  sourceSha256: hash(original), outputSha256: hash(bytes),
  recipe: 'Author 1K GLB; welded and simplified with bounded error, opaque color maps JPEG 92, alpha color retained, data maps 512px. Original dimensions, materials and source coordinates retained. No external decoder.',
  bytes: bytes.length, triangles, primitives: primitives.length, bounds: getBounds(root.listScenes()[0]),
  textures: root.listTextures().map(t => ({mimeType:t.getMimeType(), dimensions:t.getSize()})),
  extensions: root.listExtensionsUsed().map(e => e.extensionName)
};
await mkdir('app/assets/models/marine', {recursive:true});
await mkdir('docs/visual-quality/assets', {recursive:true});
await writeFile('app/assets/models/marine/atlantic-explorer-submarine.glb', bytes);
await writeFile('docs/visual-quality/assets/atlantic-explorer-submarine.json', JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record,null,2));

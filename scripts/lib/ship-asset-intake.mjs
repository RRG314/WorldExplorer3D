import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { compactPrimitive, getBounds } from '@gltf-transform/functions';
import { Matrix4, Vector3 } from 'three';
import { getModelAsset } from '../../app/js/assets/model-asset-catalog.js';

// Material-grouped exports can put a console's housings in the same node as
// room trim. Keep complete triangles inside its measured source-space envelope
// instead of dropping that material node (which leaves floating controls).
export function retainTrianglesInside(document, node, min, max) {
  const matrix = new Matrix4().fromArray(node.getWorldMatrix());
  const point = new Vector3();
  for (const primitive of node.getMesh().listPrimitives()) {
    const positions = primitive.getAttribute('POSITION');
    const indices = primitive.getIndices();
    const retained = [];
    const count = indices?.getCount() ?? positions.getCount();
    for (let i = 0; i < count; i += 3) {
      const triangle = [0, 1, 2].map(j => indices ? indices.getScalar(i + j) : i + j);
      if (triangle.every(index => {
        point.fromArray(positions.getElement(index, [])).applyMatrix4(matrix);
        return point.toArray().every((value, axis) => value >= min[axis] && value <= max[axis]);
      })) retained.push(...triangle);
    }
    if (!retained.length) { node.getMesh().removePrimitive(primitive); continue; }
    const accessor = document.createAccessor().setType('SCALAR')
      .setBuffer(positions.getBuffer()).setArray(new Uint32Array(retained));
    primitive.setIndices(accessor);
    compactPrimitive(primitive);
  }
  if (!node.getMesh().listPrimitives().length) node.setMesh(null);
}

export async function recordShipAssetIntake(sourcePath, id, document, bytes, recipe) {
  const asset = getModelAsset(`solis-${id}`);
  const hash = value => createHash('sha256').update(value).digest('hex');
  const primitives = document.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives());
  const textures = document.getRoot().listTextures().map(texture => {
    const [width, height] = texture.getSize();
    return { name: texture.getName(), width, height, mimeType: texture.getMimeType(),
      estimatedRgbaMipBytes: Math.ceil(width * height * 4 * 4 / 3) };
  });
  const record = { schemaVersion: 1, assetId: asset.id, sourceUrl: asset.sourceUrl,
    attribution: asset.attribution, license: asset.license,
    sourceSha256: hash(await readFile(sourcePath)), outputSha256: hash(bytes), recipe,
    bytes: bytes.length, triangles: primitives.reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0),
    primitives: primitives.length, bounds: getBounds(document.getRoot().listScenes()[0]), textures,
    extensions: document.getRoot().listExtensionsUsed().map(ext => ext.extensionName),
    materialCompatibility: { emissiveStrength: 'r128 runtime adapter', specular: 'standard PBR fallback; optional source extension retained' } };
  await mkdir('docs/visual-quality/assets', { recursive: true });
  await writeFile(`docs/visual-quality/assets/${id}.json`, JSON.stringify(record, null, 2) + '\n');
}

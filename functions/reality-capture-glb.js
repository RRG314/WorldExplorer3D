'use strict';

function inspectGlb(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error('invalid_glb_header');
  if (buffer.readUInt32LE(4) !== 2) throw new Error('unsupported_glb_version');
  if (buffer.readUInt32LE(8) !== buffer.length) throw new Error('invalid_glb_length');
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.toString('ascii', 16, 20);
  if (jsonType !== 'JSON' || 20 + jsonLength > buffer.length) throw new Error('invalid_glb_json_chunk');
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).replace(/\0+$/g, '').trim());
  if (json.asset?.version !== '2.0' || !Array.isArray(json.scenes) || !Array.isArray(json.meshes) || json.meshes.length === 0) {
    throw new Error('invalid_glb_scene');
  }
  if (Array.isArray(json.buffers) && json.buffers.some((item) => item.uri)) throw new Error('external_glb_buffer_forbidden');
  if (Array.isArray(json.images) && json.images.some((item) => item.uri && !String(item.uri).startsWith('data:'))) {
    throw new Error('external_glb_image_forbidden');
  }
  let triangles = 0;
  json.meshes.forEach((mesh) => (mesh.primitives || []).forEach((primitive) => {
    const accessorIndex = Number.isInteger(primitive.indices) ? primitive.indices : primitive.attributes?.POSITION;
    const count = Number(json.accessors?.[accessorIndex]?.count || 0);
    triangles += Math.floor(count / 3);
  }));
  return {
    bytes: buffer.length,
    meshes: json.meshes.length,
    materials: Array.isArray(json.materials) ? json.materials.length : 0,
    textures: Array.isArray(json.textures) ? json.textures.length : 0,
    triangles
  };
}

module.exports = { inspectGlb };

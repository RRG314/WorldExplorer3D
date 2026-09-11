'use strict';
// Execute the installed export toolchain before admitting an expensive photo job.
// Synthetic textured OBJ + 4096px EXR tests resize/material compatibility, not
// reconstruction quality. A geometry-only fixture missed the real EXR failure.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'we3d-export-preflight-'));
  try {
    const input = path.join(dir, 'triangle.obj'), output = path.join(dir, 'triangle.glb');
    execFileSync(process.env.BLENDER_BIN || 'blender', ['--background', '--factory-startup', '--python-exit-code', '1', '--python',
      path.join(__dirname, 'blender-texture-fixture.py'), '--', dir], { stdio: 'inherit', timeout: 60000 });
    execFileSync(process.env.BLENDER_BIN || 'blender', ['--background', '--factory-startup', '--python-exit-code', '1', '--python',
      path.join(__dirname, 'blender-export-glb.py'), '--', '--input', input, '--output', output], { stdio: 'inherit', timeout: 60000 });
    const bytes = await fs.readFile(output);
    if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.length < 100) throw Error('preflight_glb_missing');
    const scene = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    if (!scene.meshes?.some(mesh => mesh.primitives?.length)) throw Error('preflight_mesh_missing');
    if (!scene.images?.length || !scene.materials?.length) throw Error('preflight_texture_missing');
    const view = scene.bufferViews[scene.images[0].bufferView];
    const png = bytes.subarray(28 + bytes.readUInt32LE(12) + (view.byteOffset || 0));
    if (png.readUInt32BE(16) !== 2048 || png.readUInt32BE(20) !== 2048) throw Error('preflight_texture_resize_failed');
    console.log('Installed Blender textured OBJ / EXR → resized textured GLB execution passed.');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

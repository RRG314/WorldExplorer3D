'use strict';
// Execute the installed export toolchain before admitting an expensive photo job.
// This tiny synthetic OBJ tests compatibility only, not reconstruction quality.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'we3d-export-preflight-'));
  try {
    const input = path.join(dir, 'triangle.obj'), output = path.join(dir, 'triangle.glb');
    await fs.writeFile(input, 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
    execFileSync(process.env.BLENDER_BIN || 'blender', ['--background', '--factory-startup', '--python-exit-code', '1', '--python',
      path.join(__dirname, 'blender-export-glb.py'), '--', '--input', input, '--output', output], { stdio: 'inherit', timeout: 60000 });
    const bytes = await fs.readFile(output);
    if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.length < 100) throw Error('preflight_glb_missing');
    const scene = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    if (!scene.meshes?.some(mesh => mesh.primitives?.length)) throw Error('preflight_mesh_missing');
    console.log('Installed Blender OBJ → GLB execution passed.');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

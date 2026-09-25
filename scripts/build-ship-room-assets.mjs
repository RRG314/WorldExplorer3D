import sharp from 'sharp';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const archive = process.argv[2];
if (!archive) throw new Error('Pass the licensed Sci-Fi Interior Room ZIP');
const temporary = await mkdtemp(join(tmpdir(), 'we3d-room-'));
const output = 'app/assets/models/interiors/solis';
const kind = process.argv[3] || 'room';
const entries = { room: [['crew-bed','Bed.frozen'],['crew-display','TV'],['crew-lamp','Bed Lamp']], props: [['cargo-case','Container001'],['cargo-tank','Container002'],['cargo-locker','Container003'],['storage-case','Container004'],['bridge-chair','Chair001'],['wardroom-chair','Chair002'],['lab-stool','Chair003'],['wardroom-table','Table001']], medical: [['medical-console','']] }[kind];
if (!entries) throw new Error('Unknown asset family');
try {
  const raw = execFileSync('unzip', ['-p', archive, 'scene.gltf']);
  const json = JSON.parse(raw);
  const files = ['scene.gltf', ...json.buffers.map(b => b.uri), ...(json.images || []).map(i => i.uri)];
  for (const file of files) {
    if (!/^[\w./-]+$/.test(file) || file.split('/').includes('..') || file.startsWith('/')) throw new Error('Unsafe asset path');
    await mkdir(join(temporary, file, '..'), { recursive: true });
    await writeFile(join(temporary, file), execFileSync('unzip', ['-p', archive, file], {maxBuffer: 16 * 1024 * 1024}));
  }
  await mkdir(output, {recursive: true});
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const [id, prefix] of entries) {
    const doc = await io.read(join(temporary, 'scene.gltf'));
    for (const node of doc.getRoot().listNodes()) {
      if (node.getMesh() && !node.getName().startsWith(prefix)) node.setMesh(null);
    }
    await doc.transform(prune());
    for (const texture of doc.getRoot().listTextures()) {
      texture.setImage(await sharp(texture.getImage()).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).png().toBuffer());
      texture.setMimeType('image/png');
    }
    await writeFile(join(output, `${id}.glb`), await io.writeBinary(doc));
  }
  await writeFile(join(output, `LICENSE-${kind}.txt`), execFileSync('unzip', ['-p', archive, 'license.txt']));
} finally { await rm(temporary, {recursive:true, force:true}); }

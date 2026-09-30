import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const input=process.argv[2];
if(!input)throw Error('Pass the licensed sci-fi_computer_room.glb source.');
const document=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(input);
const output='app/assets/textures/ship';await mkdir(output,{recursive:true});
const records=[];
for(const [name,id] of [['Trim_Sheet_Wall','bulkhead'],['Carpet','carpet']]) {
 const material=document.getRoot().listMaterials().find(m=>m.getName()===name);
 if(!material)throw Error(`Missing source material ${name}`);
 for(const [channel,texture] of [['color',material.getBaseColorTexture()],['normal',material.getNormalTexture()],['roughness-metalness',material.getMetallicRoughnessTexture()]]) {
  if(!texture)continue;
  const edge=id==='bulkhead'&&channel==='color'?1024:512;
  const bytes=await sharp(texture.getImage()).resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  const filename=`${id}-${channel}.png`;await writeFile(`${output}/${filename}`,bytes);
  records.push({filename,channel,edge,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
 }
}
await writeFile(`${output}/LICENSE.txt`,'Sci-Fi Computer Room by Michael V\nhttps://sketchfab.com/3d-models/sci-fi-computer-room-a149d5bfcef6496c9a0606b5ce5ebf27\nCC-BY-4.0 — https://creativecommons.org/licenses/by/4.0/\nAdaptation: selected original material maps resized for Solis Reach surfaces.\n');
await writeFile('docs/visual-quality/assets/ship-surfaces.json',JSON.stringify({source:'https://sketchfab.com/3d-models/sci-fi-computer-room-a149d5bfcef6496c9a0606b5ce5ebf27',license:'CC-BY-4.0',sourceSha256:createHash('sha256').update(await readFile(input)).digest('hex'),textures:records},null,2)+'\n');

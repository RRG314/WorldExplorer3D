// Offline, repeatable conversion of the author's CC0 Standard archive.
// Download through https://quaternius.itch.io/stylized-nature-megakit .
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import sharp from 'sharp';
import {compactPrimitive, simplify, weld} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';

const archive=process.argv[2];
if(!archive) throw new Error('Pass the downloaded Standard nature ZIP');
const target=resolve('app/assets/models/nature');
const temporary=await mkdtemp(join(tmpdir(),'we3d-nature-convert-'));
const entries={pine:'Pine_5',broadleaf:'CommonTree_5',shrub:'Bush_Common',fern:'Fern_1',grass:'Grass_Common_Tall'};
const report=[];
await mkdir(target,{recursive:true});
try {
 for(const [id,name] of Object.entries(entries)) {
  const json=execFileSync('unzip',['-p',archive,`glTF/${name}.gltf`]);
  const gltf=JSON.parse(json);
  for(const file of [name+'.gltf',...gltf.buffers.map(b=>b.uri),...gltf.images.map(i=>i.uri)]) {
   if(!/^[\w.-]+$/.test(file)) throw new Error('Unsafe source asset path');
   await writeFile(join(temporary,file),execFileSync('unzip',['-p',archive,`glTF/${file}`],{maxBuffer:16*1024*1024}));
  }
  const io=new NodeIO();const doc=await io.read(join(temporary,name+'.gltf'));
  for(const texture of doc.getRoot().listTextures()) {
   texture.setImage(await sharp(texture.getImage()).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).png().toBuffer());
   texture.setMimeType('image/png');
  }
  const bytes=await io.writeBinary(doc);
  await writeFile(join(target,`${id}.glb`),bytes);
  let lod;
  if(id==='pine' || id==='broadleaf') {
   await MeshoptSimplifier.ready;
   await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:0.25,error:0.08,lockBorder:false}));
   // Faceted bark has attribute seams that stop topology-preserving reduction.
   // Cluster only distant bark; keep disconnected leaf cards and the near model.
   // https://github.com/zeux/meshoptimizer/blob/master/js/README.md#simplifier
   for(const mesh of doc.getRoot().listMeshes()) for(const primitive of mesh.listPrimitives()) {
    if(!/bark/i.test(primitive.getMaterial()?.getName() || '')) continue;
    const accessor=primitive.getIndices(), indices=new Uint32Array(accessor.getArray());
    const [reduced]=MeshoptSimplifier.simplifySloppy(indices,primitive.getAttribute('POSITION').getArray(),3,null,Math.floor(indices.length*.3/3)*3,.04);
    if(reduced.length>=3 && reduced.length<indices.length) {
     primitive.setIndices(accessor.clone().setArray(reduced));
     if(accessor.listParents().length===1) accessor.dispose();
     compactPrimitive(primitive);
    }
   }
   const lodBytes=await io.writeBinary(doc);
   await writeFile(join(target,`${id}-lod.glb`),lodBytes);
   lod={file:`${id}-lod.glb`,bytes:lodBytes.length,sha256:createHash('sha256').update(lodBytes).digest('hex'),triangles:doc.getRoot().listMeshes().flatMap(mesh=>mesh.listPrimitives()).reduce((total,primitive)=>total+primitive.getIndices().getCount()/3,0)};
  }
  report.push({id,sourceModel:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),triangles:gltf.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0),lod});
 }
 await writeFile(join(target,'asset-manifest.json'),JSON.stringify({source:'https://quaternius.itch.io/stylized-nature-megakit',author:'Quaternius',license:'CC0-1.0',modifications:'Selected models converted to self-contained GLB; textures resized to512px; distant tree LODs simplified with bark-only spatial reduction.',assets:report},null,2)+'\n');
 console.log(report);
} finally {await rm(temporary,{recursive:true,force:true});}

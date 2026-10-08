// Offline, bounded Smithsonian Open Access asset preparation. Decoder dependency
// is passed explicitly; runtime GLBs are self-contained and need no Draco/CDN.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,weld,simplify,transformMesh,getBounds} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import {Matrix4} from 'three';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const decoderPath=process.argv[2];if(!decoderPath)throw Error('Pass an installed draco3dgltf entry path.');
const {default:draco}=await import(pathToFileURL(decoderPath));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
await MeshoptSimplifier.ready;
// Far specimens retain silhouette at >65 m; topology seams must not defeat
// the stated draw budget. Sloppy simplification is confined to this far LOD.
const farSimplifier={...MeshoptSimplifier,simplify:(indices,positions,stride,target,error)=>MeshoptSimplifier.simplifySloppy(indices,positions,stride,null,target,error)};
const nearSimplifier={...MeshoptSimplifier,simplify:(indices,positions,stride,target,error)=>MeshoptSimplifier.simplify(indices,positions,stride,target,error,['Permissive'])};
const definitions=[
 {id:'table-coral',title:'Madrepora spicifera',specimen:'USNM 244',source:'https://3d-api.si.edu/content/document/3d_package:debebbb8-f7ee-4a6d-941c-12ea01dec71a/usnm_244-20k-thumb.glb'},
 {id:'branch-coral',title:'Madrepora formosa',specimen:'USNM 292',source:'https://3d-api.si.edu/content/document/3d_package:03d6b38a-bf7d-4334-90c9-1f7b4c3041a9/USNM_292-20k-thumb.glb'},
 {id:'massive-coral',title:'Porites lobata',specimen:'USNM 646',source:'https://3d-api.si.edu/content/document/3d_package:010228bb-75de-4fff-a848-c70584ce1087/USNM_646-20k-thumb.glb'}
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),records=[];
for(const def of definitions){
 let bytes;try{bytes=await readFile(`output/verification/product-plan/marine-source/${def.id}.glb`);}catch{const response=await fetch(def.source);if(!response.ok)throw Error(`Asset response ${response.status}`);bytes=new Uint8Array(await response.arrayBuffer());}
 if(bytes.length>8e6)throw Error('Source exceeds bounded asset budget');
 await writeFile(`output/verification/product-plan/marine-source/${def.id}.glb`,bytes);
 const doc=await io.readBinary(bytes),scene=doc.getRoot().listScenes()[0];
 const nodes=doc.getRoot().listNodes().filter(n=>n.getMesh());
 for(const node of nodes){transformMesh(node.getMesh(),node.getWorldMatrix());scene.addChild(node);node.setMatrix(new Matrix4().toArray());}
 for(const child of [...scene.listChildren()])if(!nodes.includes(child))scene.removeChild(child);
 await doc.transform(prune());const bounds=getBounds(scene),scale=2/Math.max(...bounds.max.map((v,i)=>v-bounds.min[i]));
 const matrix=new Matrix4().makeScale(scale,scale,scale).multiply(new Matrix4().makeTranslation(-(bounds.max[0]+bounds.min[0])/2,-bounds.min[1],-(bounds.max[2]+bounds.min[2])/2)).toArray();
 for(const node of nodes)transformMesh(node.getMesh(),matrix);
 // Remove museum mount/base triangles from the lowest 18 cm of each normalized
 // scan. The open cut is embedded into the authored rock at placement time.
 for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
  const positions=primitive.getAttribute('POSITION').getArray(),indices=primitive.getIndices(),kept=[];
  const input=indices.getArray();for(let i=0;i<input.length;i+=3)if([input[i],input[i+1],input[i+2]].every(n=>positions[n*3+1]>.18))kept.push(input[i],input[i+1],input[i+2]);
  indices.setArray(new Uint32Array(kept));
 }

 // Museum scans represent skeletal form. Authored living-colony coloration is
 // supplied at runtime; it is not a claimed photograph of living tissue.
 for(const material of doc.getRoot().listMaterials())material.setBaseColorFactor([1,1,1,1]).setMetallicFactor(0).setRoughnessFactor(.9);
 for(const extension of doc.getRoot().listExtensionsUsed())if(extension.extensionName==='KHR_draco_mesh_compression')extension.dispose();
 await doc.transform(weld(),simplify({simplifier:nearSimplifier,ratio:.32,error:.03,lockBorder:false}),dedup(),prune());
 const triangles=()=>doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0);
 const near=await io.writeBinary(doc);await writeFile(`app/assets/models/marine/${def.id}.glb`,near);const nearTriangles=triangles();
 await doc.transform(simplify({simplifier:farSimplifier,ratio:.25,error:.12,lockBorder:false}),prune());
 const far=await io.writeBinary(doc);await writeFile(`app/assets/models/marine/${def.id}-lod.glb`,far);
 records.push({...def,author:'Smithsonian Institution, National Museum of Natural History',license:'CC0-1.0',sourceSha256:sha(bytes),sourceBytes:bytes.length,near:{bytes:near.length,triangles:nearTriangles,sha256:sha(near)},far:{bytes:far.length,triangles:triangles(),sha256:sha(far)},bounds:getBounds(scene)});
}
const manifest={retrieved:'2026-10-02',rightsEvidence:['https://3d-api.si.edu/api-docs/','https://www.si.edu/openaccess/faq'],modifications:'Converted from Draco to self-contained GLB; scaled to 2 m maximum extent; base aligned with museum mounts cropped and cut embedded into authored rock; simplified near/far meshes. Runtime living-colony colors are authored. These specimens are shape references, not field observations at the game site.',assets:records};
await writeFile('app/assets/models/marine/asset-manifest.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('app/assets/models/marine/LICENSE.txt',`Smithsonian Institution, National Museum of Natural History\nCC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/\nAPI rights statement: https://3d-api.si.edu/api-docs/\nPolicy: https://www.si.edu/openaccess/faq\n${manifest.modifications}\n\n${records.map(r=>`${r.title} (${r.specimen})\n${r.source}`).join('\n\n')}\n`);
console.log(JSON.stringify(records.map(r=>({id:r.id,near:r.near,far:r.far,bounds:r.bounds})),null,2));

// Reproducible, offline preparation of the reviewed NASA source downloads.
// Pass the installed draco3dgltf entry; no runtime decoder or remote CDN needed.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,join,flatten,getBounds,weld,simplify} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

if(!process.argv[2])throw new Error('Pass the draco3dgltf module path');
const {default:draco}=await import(pathToFileURL(process.argv[2]));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const assets=[
 ['vehicle-assembly-building','Vehicle Assembly Building (VAB)','Vehicle Assembly Building (VAB)'],
 ['crawler','Crawler','Crawler']
];
const records=[];await mkdir('app/assets/models/nasa',{recursive:true});
for(const [id,directory,filename] of assets){
 const local=id==='vehicle-assembly-building'?filename:id;
 const bytes=await readFile(`output/venue-harbor-repair/reference/nasa/${local}.glb`);
 const doc=await io.readBinary(bytes);
 for(const e of [...doc.getRoot().listExtensionsUsed()])if(['KHR_draco_mesh_compression','KHR_materials_transmission','KHR_materials_specular','KHR_materials_ior'].includes(e.extensionName))e.dispose();
 // Imported legacy Lambert surfaces are painted cladding, not metallic glass.
 for(const m of doc.getRoot().listMaterials())m.setMetallicFactor(0).setRoughnessFactor(.78);
 await doc.transform(dedup(),flatten(),join(),prune());
 if(id==='crawler'){
  await MeshoptSimplifier.ready;
  await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.25,error:.01}),prune());
 }
 const primitives=doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives());
 const triangles=primitives.reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0);
 // The crawler retains thin tread links and railings: at the reviewed 1%
 // error bound these stop simplifying before the requested ratio. One local
 // exhibit is allowed 150k triangles / 6 materials; never a traffic fleet.
 const triangleBudget=id==='crawler'?150000:100000;
 if(primitives.length>16||triangles>triangleBudget)throw new Error(`Unbounded facility asset: ${id} (${primitives.length} primitives, ${triangles} triangles)`);
 const output=await io.writeBinary(doc);await writeFile(`app/assets/models/nasa/${id}.glb`,output);
 records.push({id,author:'NASA',source:`https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/${encodeURIComponent(directory)}`,sourceFile:filename+'.glb',sourceSha256:createHash('sha256').update(bytes).digest('hex'),sha256:createHash('sha256').update(output).digest('hex'),bytes:output.length,triangles,primitives:primitives.length,bounds:getBounds(doc.getRoot().listScenes()[0])});
}
const manifest={retrieved:'2026-10-13',rights:'NASA media usage guidance; no endorsement. NASA identifiers remain only as part of the factual facility representation.',rightsEvidence:'https://www.nasa.gov/nasa-brand-center/images-and-media/',modifications:'Decoded Draco, flattened static nodes, merged matching primitives, removed duplicate legacy texture fallbacks, retained image maps; adapted opaque Lambert surfaces to rough painted materials. Dimensions, placement and interior tour geometry are game adaptations.',assets:records};
await writeFile('app/assets/models/nasa/asset-manifest.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('app/assets/models/nasa/LICENSE.txt',`NASA 3D Resources\n${manifest.rights}\n${manifest.rightsEvidence}\n${manifest.modifications}\n\n${records.map(r=>r.id+'\n'+r.source).join('\n\n')}\n`);
console.log(JSON.stringify(records.map(({id,bytes,triangles,primitives})=>({id,bytes,triangles,primitives})),null,2));

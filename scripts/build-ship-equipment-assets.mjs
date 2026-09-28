import {updateModelAssetRevisions} from './update-model-asset-revisions.mjs';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,weld,simplify} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
import {retainTrianglesInside,recordShipAssetIntake} from './lib/ship-asset-intake.mjs';
const source=process.argv[2];
if(!source)throw Error('Pass the directory containing the licensed Sketchfab GLB downloads.');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const entries=[
 ['scifi_reactor_core','reactor-core',null],
 ['sci-fi_laboratory_op_table','medical-table',null],
 ['sci-fi_computer_room','command-console',['Object_2','Object_4','Object_5','Object_9','Object_13']],
 ['sci-fi_computer_room','laboratory-desk',['Object_2']],
 ['sci-fi_servers','equipment-server',null]
];
for(const [input,output,nodes] of entries){
 const doc=await io.read(`${source}/${input}.glb`);
 for(const node of doc.getRoot().listNodes()) {
  if(!nodes||!node.getMesh()||nodes.includes(node.getName()))continue;
  if(output==='command-console'&&['Object_6','Object_12'].includes(node.getName())) {
   retainTrianglesInside(doc,node,[-1.49,-.30,-.161],[.34,.33,.556]);
  } else node.setMesh(null);
 }
 // Preserve source material meaning. The runtime adapter handles emissive
 // strength; unsupported optional extensions retain their standard PBR fallback.
 await doc.transform(dedup(),prune());
 if(output==='command-console') {
  await MeshoptSimplifier.ready;
  await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.75,error:.0005,lockBorder:true}));
 }
 for(const texture of doc.getRoot().listTextures())texture.setImage(await sharp(texture.getImage()).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer()).setMimeType('image/webp');
 const bytes=await io.writeBinary(doc);await writeFile(`app/assets/models/interiors/solis/${output}.glb`,bytes);
 await recordShipAssetIntake(`${source}/${input}.glb`,output,doc,bytes,{nodes,textureEdge:1024,format:'webp',quality:90,consoleEnvelope:output==='command-console'?{min:[-1.49,-.30,-.161],max:[.34,.33,.556],simplification:{ratio:.75,error:.0005,lockBorder:true}}:null});
 console.log(output,bytes.length,'bytes');
}

await updateModelAssetRevisions();

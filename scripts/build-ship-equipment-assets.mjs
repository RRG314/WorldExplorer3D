import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup} from '@gltf-transform/functions';
import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
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
 for(const node of doc.getRoot().listNodes())if(nodes&&node.getMesh()&&!nodes.includes(node.getName()))node.setMesh(null);
 for(const ext of doc.getRoot().listExtensionsUsed())if(['KHR_materials_specular','KHR_materials_emissive_strength'].includes(ext.extensionName))ext.dispose();
 await doc.transform(dedup(),prune());
 for(const texture of doc.getRoot().listTextures())texture.setImage(await sharp(texture.getImage()).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer()).setMimeType('image/webp');
 const bytes=await io.writeBinary(doc);await writeFile(`app/assets/models/interiors/solis/${output}.glb`,bytes);
 console.log(output,bytes.length,'bytes');
}

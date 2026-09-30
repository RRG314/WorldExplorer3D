import {updateModelAssetRevisions} from './update-model-asset-revisions.mjs';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup} from '@gltf-transform/functions';
import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
import {recordShipAssetIntake} from './lib/ship-asset-intake.mjs';
const source=process.argv[2];
if(!source)throw Error('Pass the directory containing the owner-authorized Sketchfab wall-console download.');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
for(const [input,output] of [['wall_console','wall-instruments']]){
 const document=await io.read(`${source}/${input}.glb`);
 // Keep optional extensions and their fallback PBR materials. Emissive strength
 // is supported by the runtime compatibility adapter.
 await document.transform(dedup(),prune());
 for(const texture of document.getRoot().listTextures()){
  texture.setImage(await sharp(texture.getImage()).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer()).setMimeType('image/webp');
 }
 const bytes=await io.writeBinary(document);
 await writeFile(`app/assets/models/interiors/solis/${output}.glb`,bytes);
 await recordShipAssetIntake(`${source}/${input}.glb`,output,document,bytes,{textureEdge:1024,format:'webp',quality:90});
}

await updateModelAssetRevisions();

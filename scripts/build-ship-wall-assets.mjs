import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup} from '@gltf-transform/functions';
import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
const source=process.argv[2];
if(!source)throw Error('Pass the directory containing the two owner-authorized Sketchfab downloads.');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
for(const [input,output] of [['large_wall-mounted_computer_console','wall-navigation'],['wall_console','wall-instruments']]){
 const document=await io.read(`${source}/${input}.glb`);
 // The existing r128 loader supports the base PBR materials; retain their maps.
 for(const extension of document.getRoot().listExtensionsUsed())if(['KHR_materials_specular','KHR_materials_emissive_strength'].includes(extension.extensionName))extension.dispose();
 await document.transform(dedup(),prune());
 for(const texture of document.getRoot().listTextures()){
  texture.setImage(await sharp(texture.getImage()).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer()).setMimeType('image/webp');
 }
 await writeFile(`app/assets/models/interiors/solis/${output}.glb`,await io.writeBinary(document));
}

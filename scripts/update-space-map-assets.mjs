// Source products are recorded with each optimized, locally served runtime map.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const maps = [
 ['europa-usgs-voyager-map.jpg','https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/jupiter---europa/Jupiter%20-%20Europa.jpg'],
 ['io-jpl-galileo-map.jpg','https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/jupiter---io-(b)/Jupiter%20-%20Io%20(B).jpg'],
 ['jupiter-hubble-opal-2015.jpg','https://svs.gsfc.nasa.gov/vis/a010000/a012000/a012021/Hubble_Jupiter_color_global_map_2015a.tif']
];
for (const [file,url] of maps) {
 const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);
 const data=Buffer.from(await response.arrayBuffer());
 const metadata=await sharp(data).metadata();
 await sharp(data).resize({width:4096,withoutEnlargement:true}).jpeg({quality:90}).toFile(`app/assets/textures/${file}`);
 console.log(JSON.stringify({file,sourceWidth:metadata.width,sourceHeight:metadata.height,bytes:(await fs.stat(`app/assets/textures/${file}`)).size}));
}

// NASA VTAD publishes surface maps inside its downloadable glTF models.
// Extract the declared base-color image, never the normal map or a preview.
for (const [id,model] of Object.entries({triton:'t/Triton_1_2707',ceres:'c/Ceres_1_1000',vesta:'v/Vesta_1_100',enceladus:'e/Enceladus_1_504'})) {
 const url=`https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/${model}.glb`;
 const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error(`${id}: HTTP ${response.status}`);
 const buffer=Buffer.from(await response.arrayBuffer());
 const jsonLength=buffer.readUInt32LE(12);
 const gltf=JSON.parse(buffer.subarray(20,20+jsonLength).toString());
 const textureIndex=gltf.materials[0].pbrMetallicRoughness.baseColorTexture.index;
 const source=gltf.images[gltf.textures[textureIndex].source];
 const view=gltf.bufferViews[source.bufferView];
 const start=28+jsonLength+(view.byteOffset||0);
 const image=buffer.subarray(start,start+view.byteLength);
 const file=`app/assets/textures/${id}-nasa-vtad-map.jpg`;
 await sharp(image).resize({width:4096,withoutEnlargement:true}).jpeg({quality:90}).toFile(file);
 console.log(JSON.stringify({file,source:url,image:source.name,bytes:(await fs.stat(file)).size}));
}

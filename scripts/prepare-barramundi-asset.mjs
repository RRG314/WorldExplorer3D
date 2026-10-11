import {NodeIO} from '@gltf-transform/core';
import {clearNodeTransform,transformPrimitive,getBounds} from '@gltf-transform/functions';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source=process.argv[2];if(!source)throw Error('Pass the reviewed Khronos BarramundiFish GLB.');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=await readFile(source);
if(hash(bytes)!=='ecc3bafb6b00f2c8b810863c388e3768a7b7ea0d0335e8cb8c574c266e571f4a')throw Error('Unreviewed source bytes.');
const io=new NodeIO(),doc=await io.readBinary(bytes),root=doc.getRoot();
if(root.listSkins().length||root.listAnimations().length||root.listMeshes().length!==1)throw Error('Unexpected model structure.');
for(const node of root.listNodes())clearNodeTransform(node);
const bounds=getBounds(root.listScenes()[0]);
const scale=1.76/(bounds.max[2]-bounds.min[2]),center=bounds.min.map((v,i)=>(v+bounds.max[i])/2);
const matrix=[scale,0,0,0,0,scale,0,0,0,0,scale,0,...center.map(v=>-v*scale),1];
for(const mesh of root.listMeshes())for(const primitive of mesh.listPrimitives())transformPrimitive(primitive,matrix);
const base=new Set(root.listMaterials().map(m=>m.getBaseColorTexture()));
for(const texture of root.listTextures()){
 const image=sharp(texture.getImage()).resize(1024,1024,{fit:'inside',withoutEnlargement:true});
 texture.setImage(await (base.has(texture)?image.removeAlpha().jpeg({quality:94,chromaSubsampling:'4:4:4'}):image.png()).toBuffer());
 texture.setMimeType(base.has(texture)?'image/jpeg':'image/png');
}
const output=await io.writeBinary(doc),directory='app/assets/models/marine/barramundi';
if(output.length>2800000)throw Error('Converted fish exceeds the reviewed browser budget.');
await mkdir(directory,{recursive:true});
const record={schemaVersion:1,assetId:'marine-barramundi',title:'Barramundi fish',author:'Microsoft',license:'CC0-1.0',
 sourceUrl:'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BarramundiFish',
 downloadUrl:'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BarramundiFish/glTF-Binary/BarramundiFish.glb',
 rightsEvidence:'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BarramundiFish/README.md',
 sourceSha256:hash(bytes),sourceBytes:bytes.length,sha256:hash(output),bytes:output.length,
 triangles:root.listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount()/3,0),
 bounds:getBounds(root.listScenes()[0]),textures:root.listTextures().map(t=>({mimeType:t.getMimeType(),dimensions:t.getSize()})),
 modifications:'Baked source transform; centered and normalized to 1.76 local length for catalogue-sized instances; 1K textures, JPEG color and lossless data maps. Original topology and PBR material retained. Runtime tail deformation is authored game animation, not source motion capture.'};
await writeFile(`${directory}/barramundi.glb`,output);await writeFile(`${directory}/PROVENANCE.json`,JSON.stringify(record,null,2)+'\n');
await writeFile(`${directory}/LICENSE.txt`,'Barramundi Fish — Microsoft, 2017. CC0 1.0 Universal.\nhttps://creativecommons.org/publicdomain/zero/1.0/\nSource rights, hashes and modifications: PROVENANCE.json\n');
console.log(JSON.stringify(record,null,2));

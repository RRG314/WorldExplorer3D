import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source=process.argv[2];if(!source)throw Error('Pass the reviewed kenchoo / CGreature animated Common Dolphin GLB.');
const hash=b=>createHash('sha256').update(b).digest('hex'),original=await readFile(source);
if(hash(original)!=='75244420256fe0d45eebce0dcac67250d434fd829b811b4f8801dad0a337fa2a')throw Error('Unreviewed dolphin source.');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.readBinary(original),root=doc.getRoot();
if(root.listScenes().length!==1||root.listSkins().length!==1||root.listAnimations().length!==1)throw Error('Unexpected rig structure.');
const scene=root.listScenes()[0],bounds=getBounds(scene),center=bounds.min.map((v,i)=>(v+bounds.max[i])/2),scale=2.3/(bounds.max[0]-bounds.min[0]);
// Keep every bone, inverse bind and animated transform intact. The reviewed
// model points +X; a parent rotation turns the entire rig to game forward +Z.
const centered=doc.createNode('Source rig center').setTranslation(center.map(v=>-v));
for(const child of scene.listChildren())centered.addChild(child);
const normalized=doc.createNode('Common dolphin metres').setRotation([0,-Math.SQRT1_2,0,Math.SQRT1_2]).setScale([scale,scale,scale]).addChild(centered);scene.addChild(normalized);
const colorMaps=new Set(root.listMaterials().map(m=>m.getBaseColorTexture()));
for(const texture of root.listTextures()){
 const image=sharp(texture.getImage()).resize(1024,1024,{fit:'inside',withoutEnlargement:true}),color=colorMaps.has(texture);
 texture.setImage(await(color?image.removeAlpha().jpeg({quality:94,chromaSubsampling:'4:4:4'}):image.png()).toBuffer()).setMimeType(color?'image/jpeg':'image/png');
}
const bytes=await io.writeBinary(doc),dir='app/assets/models/marine/common-dolphin';if(bytes.length>1300000)throw Error('Dolphin exceeds browser asset budget.');
const record={schemaVersion:1,assetId:'marine-common-dolphin',title:'Common Dolphin',author:'CGreature; animated by kenchoo',license:'CC-BY-4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
 sourceUrl:'https://sketchfab.com/3d-models/common-dolphin-12c27d41204f4b92895e36072b0ba8a6',originalSourceUrl:'https://skfb.ly/oHswH',
 rightsEvidence:'Downloaded from the author page; its download panel identifies CC Attribution and commercial permission. Animation author credits CGreature and CC BY 4.0 in the model description.',
 sourceSha256:hash(original),sourceBytes:original.length,sha256:hash(bytes),bytes:bytes.length,
 triangles:root.listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount()/3,0),bounds:getBounds(scene),
 textures:root.listTextures().map(t=>({mimeType:t.getMimeType(),dimensions:t.getSize()})),animation:root.listAnimations()[0].getName(),
 modifications:'Parent-only rotation/centering and uniform 2.3 metre length; 1K textures with JPEG color. Authored skin, bone weights, swimming animation, topology and materials retained. Runtime clones have independent skeletons and animation mixers.'};
await mkdir(dir,{recursive:true});await writeFile(`${dir}/common-dolphin.glb`,bytes);await writeFile(`${dir}/PROVENANCE.json`,JSON.stringify(record,null,2)+'\n');
await writeFile(`${dir}/LICENSE.txt`,'Common Dolphin by CGreature, animated by kenchoo.\nCC BY 4.0 — https://creativecommons.org/licenses/by/4.0/\nModel: https://skfb.ly/oHswH\nAnimated adaptation: https://sketchfab.com/3d-models/common-dolphin-12c27d41204f4b92895e36072b0ba8a6\nWorld Explorer modifications: parent-only scale, orientation and centering; textures resized. No endorsement by the authors is implied. See PROVENANCE.json.\n');
console.log(JSON.stringify(record,null,2));

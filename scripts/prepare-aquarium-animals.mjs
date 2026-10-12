// Reproducible intake of the two acquired, reviewed CC-BY rigs. No remote fetch.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const review=JSON.parse(await readFile('output/aquarium-expansion/asset-review/report.json','utf8'));
if(!review.ok)throw Error('A successful original rig review is required.');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),records=[];
const sources=[
 {id:'blacktip-reef-shark',title:'Blacktip reef shark',author:'Lais.Marques',uid:'a52bb96c5a0c4157b49982471f8902b0',length:1.55,axis:0,rotation:[0,-Math.SQRT1_2,0,Math.SQRT1_2],sha256:'9f30d3aef4cfc47941fa844db4dcb0f7b4799acca8bacfa7d3972d16680cac8f'},
 {id:'green-sea-turtle',title:'Green sea turtle',author:'jgrabo20',uid:'d3dc6a6a4ff74465a59105fd7c66b32b',length:1.2,axis:2,rotation:[0,0,0,1],sha256:'7294581e0e7a2d2259ed343fcdb8dc9c7f8b55031bfffb282e4342b9cb63c818'}
];
const dir='app/assets/models/interiors/aquarium';await mkdir(dir,{recursive:true});
for(const source of sources){
 const original=await readFile(`output/aquarium-expansion/quarantine/${source.id}.source.glb`);
 if(hash(original)!==source.sha256)throw Error('Unreviewed source bytes.');
 const doc=await io.readBinary(original),root=doc.getRoot(),scene=root.listScenes()[0];
 if(root.listScenes().length!==1||root.listSkins().length!==1||root.listAnimations().length!==1)throw Error('Unexpected rig structure.');
 const bounds=review.models.find(r=>r.id===source.id&&r.sha256===source.sha256)?.state.bounds;
 if(!bounds)throw Error('Missing posed bounds.');
 const center=bounds.min.map((v,i)=>(v+bounds.max[i])/2),scale=source.length/(bounds.max[source.axis]-bounds.min[source.axis]);
 const centered=doc.createNode('Reviewed animated centre').setTranslation(center.map(v=>-v));
 for(const child of scene.listChildren())centered.addChild(child);
 scene.addChild(doc.createNode('Aquarium animal metres').setRotation(source.rotation).setScale([scale,scale,scale]).addChild(centered));
 const colorMaps=new Set(root.listMaterials().filter(m=>m.getAlphaMode()==='OPAQUE').map(m=>m.getBaseColorTexture()));
 for(const t of root.listTextures()){
  const edge=source.id==='blacktip-reef-shark'?(t.listParents().some(m=>m.getName?.()==='Body')?1024:t.listParents().some(m=>m.getName?.()==='Eyeballs1')?256:512):1024;
  const img=sharp(t.getImage()).resize(edge,edge,{fit:'inside',withoutEnlargement:true});
  t.setImage(await(colorMaps.has(t)?img.removeAlpha().jpeg({quality:92,chromaSubsampling:'4:4:4'}):img.png()).toBuffer()).setMimeType(colorMaps.has(t)?'image/jpeg':'image/png');
 }
 const bytes=await io.writeBinary(doc);if(bytes.length>4000000)throw Error('Animal exceeds its 4 MB budget.');
 const record={schemaVersion:1,id:`aquarium-${source.id}`,title:source.title,author:source.author,license:'CC-BY-4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',sourceUrl:`https://sketchfab.com/3d-models/${source.id}-${source.uid}`,sourceSha256:source.sha256,sourceBytes:original.length,sha256:hash(bytes),bytes:bytes.length,file:`${source.id}.glb`,triangles:root.listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount()/3,0),textures:root.listTextures().map(t=>({mimeType:t.getMimeType(),dimensions:t.getSize()})),sourcePosedBounds:bounds,animation:root.listAnimations()[0].getName(),normalization:{center,scale,rotation:source.rotation},modifications:'Parent-only centering, orientation and metre scale using sampled animated bounds; textures resized to 1K. Original bones, bind matrices, mesh topology and authored animation retained. This is a species illustration, not a scan of a National Aquarium animal.'};
 await writeFile(`${dir}/${record.file}`,bytes);records.push(record);
}
await writeFile(`${dir}/PROVENANCE.json`,JSON.stringify({schemaVersion:1,records},null,2)+'\n');
await writeFile(`${dir}/LICENSE.txt`,records.map(r=>`${r.title} by ${r.author}\n${r.sourceUrl}\nCC BY 4.0 — ${r.licenseUrl}\n${r.modifications}\nNo endorsement by the artist or institution is implied.\n`).join('\n'));
console.log(records.map(r=>({id:r.id,bytes:r.bytes,triangles:r.triangles})));

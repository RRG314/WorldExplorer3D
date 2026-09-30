import {updateModelAssetRevisions} from './update-model-asset-revisions.mjs';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,transformMesh,getBounds,weld,simplify,compactPrimitive} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import {Matrix4} from 'three';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const input=process.argv[2], shrubInput=process.argv[3];
if(!input||!shrubInput)throw Error('Pass the licensed denoises vegetation GLB and lev26 bush GLB.');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),assets=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const entries={pine:'5_',broadleaf:'1_',fern:'3_',shrub:null,grass:'11_'};
function thinDistantFoliage(document) {
 for(const mesh of document.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()) {
  if(primitive.getMaterial().getAlphaMode()==='OPAQUE')continue;
  const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices();
  const parents=Array.from({length:positions.getCount()},(_,i)=>i),keys=new Map();
  const root=i=>parents[i]===i?i:(parents[i]=root(parents[i]));
  for(let i=0;i<positions.getCount();i++) {
   const key=positions.getElement(i,[]).map(v=>v.toFixed(5)).join(':');
   if(keys.has(key))parents[root(i)]=root(keys.get(key));else keys.set(key,i);
  }
  for(let i=0;i<indices.getCount();i+=3)for(const j of [1,2])parents[root(indices.getScalar(i+j))]=root(indices.getScalar(i));
  const cards=new Map();
  for(let i=0;i<indices.getCount();i+=3){const key=root(indices.getScalar(i));if(!cards.has(key))cards.set(key,[]);cards.get(key).push(...[0,1,2].map(j=>indices.getScalar(i+j)));}
  // Keep complete disconnected leaf cards, distributed through the crown.
  // Never simplify through alpha-card boundaries or leave partial polygons.
  const ordered=[...cards.values()].map(card=>({card,center:card.reduce((sum,i)=>{const p=positions.getElement(i,[]);return sum.map((v,k)=>v+p[k]/card.length);},[0,0,0])}))
    .sort((a,b)=>a.center[1]-b.center[1]||a.center[0]-b.center[0]||a.center[2]-b.center[2]);
  const retained=ordered.filter((_,i)=>i%2===0).flatMap(entry=>entry.card);
  primitive.setIndices(document.createAccessor().setType('SCALAR').setBuffer(positions.getBuffer()).setArray(new Uint32Array(retained)));
  compactPrimitive(primitive);
 }
}
await MeshoptSimplifier.ready;
for(const [id,prefix] of Object.entries(entries)) {
 const document=await io.read(id==='shrub'?shrubInput:input);
 for(const node of document.getRoot().listNodes())if(prefix&&node.getMesh()&&!node.getName().startsWith(prefix))node.setMesh(null);
 await document.transform(prune(),dedup());
 // Bake the scene-display offsets once offline. Runtime instances are anchored
 // at their trunk/plant base rather than the centre of the download's gallery.
 const nodes=document.getRoot().listNodes().filter(n=>n.getMesh());
 const scene=document.getRoot().listScenes()[0];
 const bounds=getBounds(scene),stem=nodes.find(n=>/bark/i.test(n.getName()));
 let base={x:(bounds.min[0]+bounds.max[0])/2,y:bounds.min[1],z:(bounds.min[2]+bounds.max[2])/2};
 for(const node of nodes) {
  transformMesh(node.getMesh(),node.getWorldMatrix());
 }
 if(stem) {
  const positions=stem.getMesh().listPrimitives()[0].getAttribute('POSITION');
  const low=[];
  for(let i=0;i<positions.getCount();i++){const p=positions.getElement(i,[]);if(p[1]<=bounds.min[1]+.16)low.push(p);}
  if(low.length)base={x:(Math.min(...low.map(p=>p[0]))+Math.max(...low.map(p=>p[0])))/2,y:Math.min(...low.map(p=>p[1])),z:(Math.min(...low.map(p=>p[2]))+Math.max(...low.map(p=>p[2])))/2};
 }
 const translation=new Matrix4().makeTranslation(-base.x,-base.y,-base.z).toArray();
 for(const node of nodes) {
  transformMesh(node.getMesh(),translation);
  scene.addChild(node);node.setMatrix(new Matrix4().toArray());
 }
 for(const child of [...scene.listChildren()])if(!nodes.includes(child))scene.removeChild(child);
 await document.transform(prune());
 for(const texture of document.getRoot().listTextures()) {
  texture.setImage(await sharp(texture.getImage()).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).png().toBuffer()).setMimeType('image/png');
 }
 for(const material of document.getRoot().listMaterials()) {
  // Opaque alpha testing avoids order-dependent transparent forests.
  if(material.getAlphaMode()!=='OPAQUE')material.setAlphaMode('MASK').setAlphaCutoff(.5).setDoubleSided(true);
 }
 const triangles=()=>document.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount()/3,0);
 const bytes=await io.writeBinary(document);
 await writeFile(`app/assets/models/nature/${id}.glb`,bytes);
 const record={id,sourceModel:prefix||'bush',source:id==='shrub'?'https://sketchfab.com/3d-models/bush-844e6a315757431da97efb5f17383bb5':'https://sketchfab.com/3d-models/low-poly-vegetation-for-games-cdac82eb61ab4d83bf162b4c44b44d6d',author:id==='shrub'?'lev26':'denoises',license:'CC-BY-4.0',sourceSha256:hash(await readFile(id==='shrub'?shrubInput:input)),bytes:bytes.length,sha256:hash(bytes),triangles:triangles(),bounds:getBounds(scene),base};
 if(id==='pine'||id==='broadleaf') {
  thinDistantFoliage(document);
  await document.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.45,error:.02,lockBorder:false}));
  const lod=await io.writeBinary(document);await writeFile(`app/assets/models/nature/${id}-lod.glb`,lod);
  record.lod={file:`${id}-lod.glb`,bytes:lod.length,sha256:hash(lod),triangles:triangles()};
 }
 assets.push(record);
}
const manifest={source:'https://sketchfab.com/3d-models/low-poly-vegetation-for-games-cdac82eb61ab4d83bf162b4c44b44d6d',author:'denoises',license:'CC-BY-4.0',sourceSha256:hash(await readFile(input)),modifications:'Selected textured plants; source gallery offsets baked around plant bases; 512px PNG maps; alpha-tested foliage; complete leaf-card thinning and simplified distant trunks.',assets};
await writeFile('app/assets/models/nature/asset-manifest.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('app/assets/models/nature/LICENSE.txt',`Low poly vegetation for games by denoises\n${manifest.source}\nCC-BY-4.0 — https://creativecommons.org/licenses/by/4.0/\n${manifest.modifications}\n\nBush by lev26\nhttps://sketchfab.com/3d-models/bush-844e6a315757431da97efb5f17383bb5\nCC-BY-4.0 — https://creativecommons.org/licenses/by/4.0/\nBase aligned; resized maps; alpha-tested leaves.\n`);
console.log(assets.map(({id,bytes,triangles,lod})=>({id,bytes,triangles,lodTriangles:lod?.triangles})));

await updateModelAssetRevisions();

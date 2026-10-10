import {NodeIO} from '@gltf-transform/core';
import {flatten,prune,dedup,weld,simplify,join,transformPrimitive,compactPrimitive,getBounds} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import {Matrix4,BoxGeometry,BufferGeometry,BufferAttribute} from 'three';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {updateModelAssetRevisions} from './update-model-asset-revisions.mjs';
const source=process.argv[2];if(!source)throw Error('Pass the licensed RCRV GLB downloaded by the owner.');
const bytes=await readFile(source),io=new NodeIO(),doc=await io.readBinary(bytes);
const metadata=doc.getRoot().getAsset().extras;
if(metadata?.license?.startsWith('CC-BY-4.0')!==true||!metadata.source?.endsWith('11b4b97a9e60497ea91c0727e404ecf6'))throw Error('Unexpected source or license.');
const before=[];
for(const node of doc.getRoot().listNodes())if(node.getMesh()){before.push({name:node.getName(),bounds:getBounds(node)});if(['Ocean_0','Container 1_1'].includes(node.getName()))node.setMesh(null);}
for(const material of doc.getRoot().listMaterials()){
 const name=material.getName();
 if(name==='Black')material.setMetallicFactor(.03).setRoughnessFactor(.58);
 if(name==='White'||material.getBaseColorFactor().slice(0,3).every(v=>v>.95))material.setBaseColorFactor([.68,.7,.7,1]).setMetallicFactor(.03).setRoughnessFactor(.55);
 if(name==='material')material.setMetallicFactor(.02).setRoughnessFactor(.68);
 if(name==='Windows')material.setBaseColorFactor([.055,.11,.14,1]).setMetallicFactor(.1).setRoughnessFactor(.22);
}
await doc.transform(prune(),flatten());
// Game adaptation of the 2017 educational design: 1.2x uniform scale, +Z bow,
// centered beam, waterline at the existing catalog's 5.6 m draft. No exact-twin claim.
const normalize=[0,0,1.2,0,0,1.2,0,0,-1.2,0,0,0,5.686*1.2,-5.6,-1.3*1.2,1];
const buffer=doc.getRoot().listBuffers()[0];
function split(poly,axis,bound,sign){
 const inside=[],outside=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-bound)*sign,db=(b[axis]-bound)*sign;
  (da>=0?inside:outside).push(a);
  if((da<0)!==(db<0)){const f=da/(da-db),p=a.map((v,j)=>v+(b[j]-v)*f);inside.push(p);outside.push(p);}
 }
 return {inside,outside};
}
function cutPortal(primitive,min,max){
 const p=primitive.getAttribute('POSITION'),n=primitive.getAttribute('NORMAL'),indices=primitive.getIndices(),positions=[],normals=[];
 const count=indices?indices.getCount():p.getCount(),point=[],normal=[];
 function emit(poly){for(let i=1;i+1<poly.length;i++)for(const v of [poly[0],poly[i],poly[i+1]]){positions.push(...v.slice(0,3));normals.push(...v.slice(3));}}
 for(let i=0;i<count;i+=3){
  let poly=[];
  for(let j=0;j<3;j++){const index=indices?indices.getScalar(i+j):i+j;p.getElement(index,point);n.getElement(index,normal);poly.push([...point,...normal]);}
  for(let axis=0;axis<3&&poly.length;axis++)for(const [bound,sign] of [[min[axis],1],[max[axis],-1]]){
   const parts=split(poly,axis,bound,sign);if(parts.outside.length>=3)emit(parts.outside);poly=parts.inside;
  }
 }
 primitive.setIndices(null).setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
  .setAttribute('NORMAL',doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer));
}
for(const node of doc.getRoot().listNodes()){
 const mesh=node.getMesh();if(!mesh)continue;
 const matrix=new Matrix4().fromArray(normalize).multiply(new Matrix4().fromArray(node.getWorldMatrix())).toArray();
 for(const primitive of mesh.listPrimitives()){
  compactPrimitive(primitive);
  transformPrimitive(primitive,matrix);
  // A real opening in the science van, not a transparent wall/collision cheat.
  if(node.getName().startsWith('Container 1_'))cutPortal(primitive,[5.05,2.02,-27],[7.05,4.6,-25.7]);
  // Removable port bulwark at the game dive ladder. Retain the rest of the rail.
  if(/Bulwarks Left|Bulwarks\.0(15|16)/.test(node.getName()))cutPortal(primitive,[7.6,2,-32.4],[8.5,3.6,-29.6]);
 }
 node.setMatrix(new Matrix4().toArray());
}
// The educational source has no interior van floor. Install a visible steel
// sole plate, used by the exact same triangle support query as the hull.
const floorGeometry=new BoxGeometry(2.96,.05,7.5);floorGeometry.translate(6,1.96,-22.4);
const floorMaterial=doc.createMaterial('Science van non-slip floor').setBaseColorFactor([.14,.18,.2,1]).setMetallicFactor(.02).setRoughnessFactor(.94);
const floor=doc.createPrimitive().setMaterial(floorMaterial);
for(const [name,attribute] of [['POSITION','position'],['NORMAL','normal']])floor.setAttribute(name,doc.createAccessor().setType('VEC3').setBuffer(buffer).setArray(floorGeometry.getAttribute(attribute).array));
floor.setIndices(doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(floorGeometry.getIndex().array));
doc.getRoot().listScenes()[0].addChild(doc.createNode('Science van sole plate').setMesh(doc.createMesh().addPrimitive(floor)));
await doc.transform(dedup(),prune(),weld());
await MeshoptSimplifier.ready;
await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:.62,error:.0003,lockBorder:true}),join(),prune());
const out='app/assets/models/marine/research-vessel';await mkdir(out,{recursive:true});
const result=await io.writeBinary(doc);await writeFile(`${out}/rcrv.glb`,result);
const lod=await io.readBinary(result);
for(const mesh of lod.getRoot().listMeshes())for(const primitive of mesh.listPrimitives())primitive.setAttribute('NORMAL',null);
await lod.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.12,error:.002,lockBorder:false}),prune());
for(const mesh of lod.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
 const geometry=new BufferGeometry().setAttribute('position',new BufferAttribute(primitive.getAttribute('POSITION').getArray(),3));
 geometry.setIndex(new BufferAttribute(primitive.getIndices().getArray(),1));geometry.computeVertexNormals();
 primitive.setAttribute('NORMAL',lod.createAccessor().setType('VEC3').setArray(geometry.getAttribute('normal').array).setBuffer(lod.getRoot().listBuffers()[0]));
}
const lodBytes=await io.writeBinary(lod);await writeFile(`${out}/rcrv-lod.glb`,lodBytes);
let triangles=0;for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
const provenance={version:1,title:metadata.title,author:metadata.author,source:metadata.source,license:'CC-BY-4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
 sourceSha256:createHash('sha256').update(bytes).digest('hex'),sourceBytes:bytes.length,outputSha256:createHash('sha256').update(result).digest('hex'),outputBytes:result.length,triangles,
 distant:{bytes:lodBytes.length,sha256:createHash('sha256').update(lodBytes).digest('hex'),triangles:lod.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((sum,p)=>sum+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0)},
 adaptation:'Ocean presentation and van placeholder cylinders removed; uniform 1.2 scale and waterline alignment; science-van door, visible interior sole plate and removable bulwark opening; painted surfaces given dielectric material response; conservative geometry simplification and material batching. Game adaptation of a 2017 educational vessel model, not an exact model of the commissioned vessel.',
 references:['https://ceoas.oregonstate.edu/regional-class-research-vessel-ship-design','https://ceoas.oregonstate.edu/sites/ceoas.oregonstate.edu/files/2024-07/rcrv-particulars.pdf'],bounds:getBounds(doc.getRoot().listScenes()[0])};
await writeFile(`${out}/PROVENANCE.json`,JSON.stringify(provenance,null,2)+'\n');
await writeFile(`${out}/LICENSE.txt`,`${metadata.title}\n${metadata.author}\n${metadata.source}\nLicensed under Creative Commons Attribution 4.0 International\nhttps://creativecommons.org/licenses/by/4.0/\n\n${provenance.adaptation}\n`);
await updateModelAssetRevisions();console.log(JSON.stringify(provenance,null,2));

// Offline, pinned Karol Miklas Carrera 4S exterior -> rigid metric GLB.
// The original CC-BY-SA licence follows every derivative. No simulation enters
// the runtime. Pass SOURCE_DIRECTORY and an EMPTY_OUTPUT_DIRECTORY.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS, KHRMaterialsClearcoat} from '@gltf-transform/extensions';
import {compactPrimitive,dedup,flatten,getBounds,join,prune,simplify,transformMesh,weld} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import {Matrix4} from 'three';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const pins={
 'scene.gltf':'7a247123b0439c8f7b30cc050a9f9fcca54ff49f806bb87c6e7d7d4dfcd6eaee',
 'scene.bin':'a38296ea8cabee4f6d11ed8e0ae2840f12ca4811cc0ae6c44cd7576cddb34803',
 'license.txt':'807197ef352fd72292e5a0f30b7edadc93d5c916a747f902ec87795ae8201d1a',
 'textures/license_baseColor.png':'fe664221ac57349b00057cacfa0dd65525875408cc6fc80a5140e2788caec4e2',
 'textures/tex_shiny_baseColor.png':'afad5dafe7d8db4d2f6b8687ac37cf51daa4bcb943d28578667d7c2fcaccfa62',
 'textures/Material_baseColor.png':'b50ba2cbe8f1a866c2aa9f2c7993a47f3436d5555f13248264aedeac31a2b35b',
 'textures/logo_baseColor.png':'788e7026c4c4c7091179fbd30357bf412c7d3b05f12ef7619f5b96bb2c47cfc6',
 'textures/paint_metallicRoughness.png':'7f71bd3fa1a64d5b14b54a2b0a48ebd3d1c5a9ddbc201e7a0cabc42dbd06d287',
 'textures/rubber_metallicRoughness.png':'7257268605c3d2bb2bbdeceb3c84feaf4af48bc333b889c06d4792fa836ce1ec',
 'textures/tex_shiny_emissive.png':'c2e0ba63d93e0ea063b5ee9f4fed686cc2253ec8511d64d86e5bbdf839ad2601',
 'textures/license_normal.png':'1eb385c8ba1e9dfe4a1a6fb2f7a634253c1e78954588e914fd3a5ace1d52d849',
 'textures/Material_metallicRoughness.png':'2a460a8ee39795fdd6520f549788acadcb5e557a755f540daaa2717fec8a9d94',
 'textures/rubber_normal.png':'842c0b191e41a80ca99823d7fb4d15b8fcd49d204dc915db7b5cdecc93fdee82'
};
const archiveSha256='57731111fbb0d6958df64454e9ba51939fefd39ab48e55f423a0bb2d76918454';
const [source,out]=process.argv.slice(2);
if(!source||!out)throw Error('Usage: node scripts/prepare-porsche-carrera-exterior.mjs SOURCE EMPTY_OUTPUT');
await mkdir(out,{recursive:true});if((await readdir(out)).length)throw Error('Output must be empty');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [file,pin]of Object.entries(pins))if(hash(await readFile(path.join(source,file)))!==pin)throw Error('Unreviewed source: '+file);
const intake=JSON.parse(await readFile(path.join(source,'intake.json'),'utf8'));
if(intake.archiveSha256!==archiveSha256)throw Error('Unreviewed source archive');
const licence=await readFile(path.join(source,'license.txt'),'utf8');
if(!licence.includes('CC-BY-SA-4.0')||!licence.includes('d01b254483794de3819786d93e0e1ebf'))throw Error('Source licence mismatch');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read(path.join(source,'scene.gltf')),root=doc.getRoot(),scene=root.listScenes()[0];
if(root.listAnimations().length||root.listSkins().length)throw Error('Rigid source required');
const parts=root.listNodes().filter(n=>n.getMesh());
for(const node of parts)node.setExtras({sourcePart:node.getName()});
await doc.transform(flatten());
const meshes=[];
for(const node of parts){
 const primitives=node.getMesh().listPrimitives();
 // The floor is the source showroom plane. The separate coat duplicates the
 // exterior shell; use one physical clearcoat material instead of overlapping
 // alpha geometry. Painted body geometry is retained independently.
 if(node.getExtras().sourcePart==='Plane_0'||primitives.every(p=>p.getMaterial()?.getName()==='coat'))continue;
 const mesh=node.getMesh().clone();node.setMesh(mesh);
 transformMesh(mesh,new Matrix4().fromArray(node.getWorldMatrix()).toArray());
 scene.addChild(node);node.setMatrix(new Matrix4().toArray());meshes.push(node);
}
for(const child of [...scene.listChildren()])if(!meshes.includes(child))scene.removeChild(child);
await doc.transform(prune());

// Source wheel meshes combine both sides. Split only disconnected wheel and
// caliper triangles, then restore their common straight front-axle pose.
const wheels=new Map(),calipers=new Map();
for(const node of meshes){
 if(!/^Cylinder\.00[01]_/.test(node.getExtras().sourcePart))continue;
 for(const primitive of node.getMesh().listPrimitives()){
  const pos=primitive.getAttribute('POSITION'),index=primitive.getIndices(),groups=new Map();
  for(let i=0;i<(index?.getCount()||pos.getCount());i+=3){
   const indices=[0,1,2].map(j=>index?index.getScalar(i+j):i+j),c=[0,0,0];
   for(const j of indices){const p=pos.getElement(j,[]);for(let k=0;k<3;k++)c[k]+=p[k]/3;}
   const id=`${c[2]>0?'front':'rear'}-${c[0]>-.015285?'right':'left'}`;
   if(!groups.has(id))groups.set(id,[]);groups.get(id).push(...indices);
  }
  const fixed=primitive.getMaterial()?.getName()==='Material.001',target=fixed?calipers:wheels;
  for(const [id,indices]of groups){
   const p=primitive.clone().setIndices(doc.createAccessor().setType('SCALAR').setBuffer(root.listBuffers()[0]).setArray(new Uint32Array(indices)));
   compactPrimitive(p);if(!target.has(id))target.set(id,[]);target.get(id).push(p);
  }
 }
 node.setMesh(null);
}
const tireCenter=id=>{
 const p=wheels.get(id).find(p=>p.getMaterial()?.getName()==='rubber'),a=p.getAttribute('POSITION');
 const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<a.getCount();i++){const v=a.getElement(i,[]);for(let k=0;k<3;k++){minimum[k]=Math.min(minimum[k],v[k]);maximum[k]=Math.max(maximum[k],v[k]);}}
 return minimum.map((n,i)=>(n+maximum[i])/2);
};
const centers=new Map([...wheels.keys()].map(id=>[id,tireCenter(id)]));
const frontZ=(centers.get('front-right')[2]+centers.get('front-left')[2])/2;
const wheelNodes=[];
for(const [id,primitives]of wheels){
 const c=centers.get(id),straight=id.startsWith('front'),rest=[c[0],c[1],straight?frontZ:c[2]];
 const rotate=new Matrix4().makeTranslation(...rest).multiply(new Matrix4().makeRotationY(straight?20*Math.PI/180:0)).multiply(new Matrix4().makeTranslation(...c.map(n=>-n)));
 for(const [list,fixed]of [[primitives,false],[calipers.get(id)||[],true]]){
  const mesh=doc.createMesh(id+(fixed?'-caliper':'-wheel'));for(const p of list)mesh.addPrimitive(p);
  transformMesh(mesh,rotate.toArray());
  const node=doc.createNode(mesh.getName()).setMesh(mesh).setExtras({wheelKey:id,fixedCaliper:fixed});scene.addChild(node);wheelNodes.push(node);
 }
}
await doc.transform(prune());
const bounds=getBounds(scene),length=4.435,factor=length/(bounds.max[2]-bounds.min[2]);
const center=[(bounds.min[0]+bounds.max[0])/2,bounds.min[1],(bounds.min[2]+bounds.max[2])/2];
const normalize=new Matrix4().makeScale(factor,factor,factor).multiply(new Matrix4().makeTranslation(...center.map(n=>-n)));
for(const node of root.listNodes().filter(n=>n.getMesh()))transformMesh(node.getMesh(),normalize.toArray());
const clearcoat=doc.createExtension(KHRMaterialsClearcoat);
for(const m of root.listMaterials()){
 const name=m.getName();
 if(name==='paint')m.setMetallicRoughnessTexture(null).setBaseColorFactor([.045,.14,.20,1]).setMetallicFactor(.45).setRoughnessFactor(.28).setExtension('KHR_materials_clearcoat',clearcoat.createClearcoat().setClearcoatFactor(.8).setClearcoatRoughnessFactor(.16));
 if(name==='window')m.setBaseColorFactor([.13,.21,.25,.16]).setMetallicFactor(.02).setRoughnessFactor(.12).setDoubleSided(true);
 if(name==='rubber')m.setMetallicFactor(0).setRoughnessFactor(.96);
}
for(const texture of root.listTextures())texture.setImage(await sharp(texture.getImage()).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).png().toBuffer()).setMimeType('image/png');
await MeshoptSimplifier.ready;
await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.16,error:.001,lockBorder:false}));
for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives()){
 const m=p.getMaterial();if(p.getAttribute('COLOR_0')||[m?.getBaseColorTexture(),m?.getNormalTexture(),m?.getMetallicRoughnessTexture(),m?.getEmissiveTexture()].some(Boolean))continue;
 const i=p.getIndices(),pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL');if(!i||!normal||i.getCount()<360)continue;
 const [indices]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(i.getArray()),new Float32Array(pos.getArray()),3,new Float32Array(normal.getArray()),3,[.25,.25,.25],null,Math.floor(i.getCount()*.35/3)*3,.003,['Permissive']);
 p.setIndices(doc.createAccessor().setType('SCALAR').setBuffer(i.getBuffer()).setArray(indices));compactPrimitive(p);
}
// Simplification can move an extreme vertex slightly. Finish normalization
// against the actual retained exterior before recording wheel pivots/cabin fit.
const finalBounds=getBounds(scene),finalFactor=length/(finalBounds.max[2]-finalBounds.min[2]);
const finalCenter=[(finalBounds.min[0]+finalBounds.max[0])/2,finalBounds.min[1],(finalBounds.min[2]+finalBounds.max[2])/2];
const finalNormalize=new Matrix4().makeScale(finalFactor,finalFactor,finalFactor).multiply(new Matrix4().makeTranslation(...finalCenter.map(n=>-n)));
for(const node of root.listNodes().filter(n=>n.getMesh()))transformMesh(node.getMesh(),finalNormalize.toArray());
const wheelLayout=[];
for(const [id]of wheels){
 const node=wheelNodes.find(n=>n.getExtras().wheelKey===id&&!n.getExtras().fixedCaliper),b=getBounds(node),c=b.min.map((n,i)=>(n+b.max[i])/2),radius=(b.max[1]-b.min[1])/2;
 transformMesh(node.getMesh(),new Matrix4().makeTranslation(...c.map(n=>-n)).toArray());
 const steer=doc.createNode(id+'-steer').setTranslation(c).setExtras({transportPart:'wheel-steering',front:id.startsWith('front')});
 const spin=doc.createNode(id+'-spin').setMesh(node.getMesh()).setExtras({transportPart:'wheel-spin',radiusMeters:radius});steer.addChild(spin);scene.addChild(steer);node.setMesh(null);
 const fixed=wheelNodes.find(n=>n.getExtras().wheelKey===id&&n.getExtras().fixedCaliper);
 transformMesh(fixed.getMesh(),new Matrix4().makeTranslation(...c.map(n=>-n)).toArray());fixed.setExtras({transportPart:'wheel-caliper'});steer.addChild(fixed);
 wheelLayout.push({id,position:c,radius});
}
const preserve=node=>{for(let n=node;n;n=n.getParentNode())if(n.getExtras().transportPart)return true;return false;};
await doc.transform(prune(),dedup(),join({filter:n=>!preserve(n)}),prune());
const triangles=root.listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),bytes=await io.writeBinary(doc);
if(triangles>100000||bytes.length>6500000)throw Error(`Exterior budget exceeded: ${triangles} triangles, ${bytes.length} bytes`);
const final=getBounds(scene);
if(Math.abs(final.min[1])>.00001||Math.abs(final.max[2]-final.min[2]-length)>.00001)throw Error('Exterior metric envelope changed');
await writeFile(path.join(out,'scene.glb'),bytes);await writeFile(path.join(out,'license.txt'),licence);
await writeFile(path.join(out,'intake.json'),JSON.stringify({archiveSha256,license:'CC-BY-SA-4.0',sourceUrl:'https://sketchfab.com/3d-models/free-porsche-911-carrera-4s-d01b254483794de3819786d93e0e1ebf',author:'Karol Miklas',label:'Porsche 911 Carrera 4S',lengthMeters:length,wheelLayout,exteriorSha256:hash(bytes),triangles,sourceFiles:pins,modifications:'Original Carrera 4S exterior; showroom floor removed; duplicate coat replaced by PBR clearcoat; uniform metric normalization; 512px maps; bounded simplification; front wheels restored from 20 degree showcase pose to a straight common axle; four rigid wheel assemblies and fixed calipers. No source simulation or GT3 identity.'},null,2)+'\n');
console.log(JSON.stringify({bytes:bytes.length,triangles,sha256:hash(bytes),wheelLayout}));

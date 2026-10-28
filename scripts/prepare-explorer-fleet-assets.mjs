// Reproducible, offline derivatives. Download the credited glTF archives through
// Sketchfab, extract each into SOURCE/<key>, and pass an EMPTY output directory.
// Originals, credentials and marketplace archives never enter the web bundle.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {compactPrimitive, dedup, flatten, getBounds, join, prune, simplify, transformMesh, weld} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import {Matrix4} from 'three';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const recipes = [
  {key:'delorean', variantId:'delorean', id:'road-delorean-dmc12', label:'DeLorean DMC-12', uid:'7001f739fe594314b5a3081163577139', author:'JandroS', dimensions:[2.17,1.2,4.27], yaw:0, ratio:.25, paint:[], wheels:/(?:^|\/)(?:Front Wheel Llanta|Back Wheel Llanta|Tire Front|Tire Back|WheelPlate)/i},
  {key:'cadillac', variantId:'cadillac_coupe', id:'road-cadillac-coupe-deville', label:'Cadillac Coupe deVille', uid:'2adc47898c3145078f0b3bc51995cfe9', author:'its.anjaney', dimensions:[2.03,1.42,5.7], yaw:Math.PI/2, ratio:.075, paint:['car_colour'], wheels:/TYRES/i},
  {key:'fleetwood', variantId:'cadillac_fleetwood', id:'road-cadillac-fleetwood-brougham', label:'Cadillac Fleetwood Brougham · early 1980s', uid:'e0bbaf9283b2413a8dae9b991fe121ff', author:'scorpion81', dimensions:[2.02,1.46,5.62], yaw:0, ratio:.025, paint:['Paint'], wheels:/(?:^|\/)(?:Wheel(?:\.\d+)?_|TireSegment)/},
  {key:'golf', variantId:'golf_ii', id:'road-volkswagen-golf-ii', label:'Volkswagen Golf II', uid:'740500f10bc94e7a91c2290e445fcb39', author:'ARDmation', dimensions:[1.86,1.41,3.99], yaw:0, ratio:1, paint:['paint'], wheels:/^(tire|hoodcap)$/i},
  {key:'datsun', variantId:'datsun_280z', id:'road-datsun-280z', label:'Datsun 280Z', uid:'0789ab2ece9442de94b3c41595e0ecbd', author:'Martin Trafas', dimensions:[1.73,1.3,4.42], yaw:0, ratio:.24, paint:['280z_CarPaint'], wheels:/^SSR_(Rim|Tire)$/i},
  {key:'cessna', id:'aircraft-cessna-172', label:'Cessna 172', uid:'64cddaee5aff470682659a8c08525046', author:'Nobilis the Palaeovespa', dimensions:[10.9,2.2,7.9], yaw:2*Math.asin(.23613198081409342), ratio:1, aircraft:true},
  {key:'falcon', id:'aircraft-falcon-10', label:'Dassault Falcon 10', uid:'0d5a676f75da403b8419154b102d55a7', author:'manilov.ap', dimensions:[14.1,3.8,15.2], yaw:Math.PI/4, ratio:1, aircraft:true}
];
const [sourceDir, outputDir, ...selectedKeys] = process.argv.slice(2);
if (!sourceDir || !outputDir) throw Error('Usage: node scripts/prepare-explorer-fleet-assets.mjs SOURCE EMPTY_OUTPUT');
await mkdir(outputDir,{recursive:true});
if ((await readdir(outputDir)).length) throw Error('Output must be empty; never overwrite originals or a reviewed derivative.');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS), records=[];
await MeshoptSimplifier.ready;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function ancestorName(node) {
  const names=[];for(let p=node;p;p=p.getParentNode())names.push(p.getName());return names.join('/');
}
function triangleCount(doc) {
  return doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0);
}
function simplifyUntexturedModifierSeams(doc) {
  // This source has no texture/vertex-color streams. Normal-aware permissive
  // simplification can cross modifier-generated duplicate seams while retaining
  // material boundaries and silhouette error, rather than dropping its interior.
  if(doc.getRoot().listTextures().length)throw Error('Modifier-seam recipe requires an untextured source.');
  for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
    const index=primitive.getIndices(),position=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL');
    if(!index||!normal||index.getCount()<360)continue;
    const indices=new Uint32Array(index.getArray());
    const [simplified]=MeshoptSimplifier.simplifyWithAttributes(indices,new Float32Array(position.getArray()),3,new Float32Array(normal.getArray()),3,[.25,.25,.25],null,Math.floor(indices.length*.3/3)*3,.01,['Permissive']);
    primitive.setIndices(doc.createAccessor().setType('SCALAR').setBuffer(index.getBuffer()).setArray(simplified));compactPrimitive(primitive);
  }
}
function separatePropeller(doc, scene) {
  const propeller=doc.createMesh('Cessna authored propeller');
  for(const mesh of [...doc.getRoot().listMeshes()])for(const primitive of [...mesh.listPrimitives()]){
    const position=primitive.getAttribute('POSITION'),index=primitive.getIndices(),parents=Array.from({length:position.getCount()},(_,i)=>i),keys=new Map();
    const find=i=>parents[i]===i?i:parents[i]=find(parents[i]);
    for(let i=0;i<position.getCount();i++){
      const key=position.getElement(i,[]).map(v=>v.toFixed(5)).join(':');
      if(keys.has(key))parents[find(i)]=find(keys.get(key));else keys.set(key,i);
    }
    for(let i=0;i<index.getCount();i+=3)for(const j of [1,2])parents[find(index.getScalar(i+j))]=find(index.getScalar(i));
    const parts=new Map();
    for(let i=0;i<index.getCount();i+=3){const key=find(index.getScalar(i));if(!parts.has(key))parts.set(key,[]);parts.get(key).push(...[0,1,2].map(j=>index.getScalar(i+j)));}
    const retained=[];
    for(const indices of parts.values()){
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      for(const i of indices){const v=position.getElement(i,[]);for(let k=0;k<3;k++){min[k]=Math.min(min[k],v[k]);max[k]=Math.max(max[k],v[k]);}}
      const span=Math.max(max[0]-min[0],max[1]-min[1]);
      if(min[2]>3.15&&max[2]-min[2]<.2&&span>.6&&span<2.6){
        const part=primitive.clone().setIndices(doc.createAccessor().setType('SCALAR').setBuffer(doc.getRoot().listBuffers()[0]).setArray(new Uint32Array(indices)));compactPrimitive(part);propeller.addPrimitive(part);
      }else retained.push(...indices);
    }
    primitive.setIndices(doc.createAccessor().setType('SCALAR').setBuffer(doc.getRoot().listBuffers()[0]).setArray(new Uint32Array(retained)));compactPrimitive(primitive);
  }
  if(!propeller.listPrimitives().length)throw Error('Cessna propeller components not identified; review source geometry.');
  const pivot=doc.createNode('Cessna propeller pivot').setMesh(propeller).setExtras({aircraftRotor:'propeller'});scene.addChild(pivot);
  const b=getBounds(pivot),center=b.min.map((v,i)=>(v+b.max[i])/2);transformMesh(propeller,new Matrix4().makeTranslation(...center.map(v=>-v)).toArray());pivot.setTranslation(center);
}
for (const recipe of recipes.filter(r=>!selectedKeys.length||selectedKeys.includes(r.key))) {
  const input=path.join(sourceDir,recipe.key,'scene.gltf');
  const doc=await io.read(input), root=doc.getRoot(), scene=root.listScenes()[0];
  if(root.listSkins().length||root.listAnimations().length)throw Error(`${recipe.key}: animated source needs a separate reviewed recipe.`);
  const meshes=root.listNodes().filter(n=>n.getMesh());
  for(const node of meshes)node.setExtras({...node.getExtras(),sourcePart:ancestorName(node)});
  await doc.transform(flatten());
  const rotation=new Matrix4().makeRotationY(recipe.yaw);
  for(const node of meshes) {
    const mesh=node.getMesh().clone();node.setMesh(mesh);
    transformMesh(mesh,rotation.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix())).toArray());
    scene.addChild(node);node.setMatrix(new Matrix4().toArray());
  }
  for(const child of [...scene.listChildren()])if(!meshes.includes(child))scene.removeChild(child);
  await doc.transform(prune());
  const bounds=getBounds(scene), size=bounds.max.map((v,i)=>v-bounds.min[i]);
  const scale=recipe.dimensions.map((v,i)=>v/size[i]);
  const center=[(bounds.min[0]+bounds.max[0])/2,bounds.min[1],(bounds.min[2]+bounds.max[2])/2];
  const normalize=new Matrix4().makeScale(...scale).multiply(new Matrix4().makeTranslation(...center.map(v=>-v)));
  for(const node of meshes)transformMesh(node.getMesh(),normalize.toArray());
  // Correct mirror-like painted bodywork for the game's outdoor lighting.
  // Keep stainless steel, glass, upholstery and authored texture maps separate.
  for(const mat of root.listMaterials())if(recipe.paint?.includes(mat.getName())){
    mat.setMetallicFactor(.35).setRoughnessFactor(.32);
    if(recipe.key==='cadillac')mat.setBaseColorFactor([.12,.2,.28,1]);
  }
  if(recipe.key==='cadillac')for(const mat of root.listMaterials())if(mat.getName()==='cloth')mat.setMetallicFactor(0).setRoughnessFactor(.85).setBaseColorFactor([.09,.1,.12,1]);
  if(recipe.key==='delorean')for(const mat of root.listMaterials())if(mat.getMetallicFactor()>.5&&mat.getRoughnessFactor()<.4)mat.setRoughnessFactor(.4);
  const colorMaps=new Set(root.listMaterials().map(m=>m.getBaseColorTexture()));
  for(const texture of root.listTextures()){
    const edge=colorMaps.has(texture)?512:256;
    texture.setImage(await sharp(texture.getImage()).resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).png().toBuffer()).setMimeType('image/png');
  }
  const sourceTriangles=triangleCount(doc);
  await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:recipe.ratio,error:recipe.key==='fleetwood'?.01:.001,lockBorder:false}));
  if(recipe.key==='fleetwood')simplifyUntexturedModifierSeams(doc);
  if(recipe.key==='cessna')separatePropeller(doc,scene);
  // Wheel groups retain artist geometry/materials. Split combined left/right
  // wheel primitives by axle quadrant, never by cutting arbitrary body panels.
  const wheelMeshes=new Map();
  if(!recipe.aircraft)for(const node of meshes){
    const mesh=node.getMesh();
    if(!mesh)continue; // Pruning can remove empty modifier-generated parts.
    for(const primitive of [...mesh.listPrimitives()]){
      if(!recipe.wheels.test(node.getExtras().sourcePart||'')&&!recipe.wheels.test(primitive.getMaterial()?.getName()||''))continue;
      const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices(),groups=new Map();
      for(let i=0;i<(indices?.getCount()||positions.getCount());i+=3){
        const tri=[0,1,2].map(j=>indices?indices.getScalar(i+j):i+j);
        const c=tri.reduce((sum,j)=>{const v=positions.getElement(j,[]);return sum.map((n,k)=>n+v[k]/3);},[0,0,0]);
        const key=`${c[2]>0?'front':'rear'}-${c[0]>0?'right':'left'}`;
        if(!groups.has(key))groups.set(key,[]);groups.get(key).push(...tri);
      }
      for(const [key,selected] of groups){
        const part=primitive.clone().setIndices(doc.createAccessor().setType('SCALAR').setBuffer(root.listBuffers()[0]).setArray(new Uint32Array(selected)));
        compactPrimitive(part);
        if(!wheelMeshes.has(key))wheelMeshes.set(key,doc.createMesh(key));wheelMeshes.get(key).addPrimitive(part);
      }
      mesh.removePrimitive(primitive);
    }
  }
  const wheelLayout=[];
  for(const [key,mesh] of wheelMeshes){
    const spin=doc.createNode(`${key}-spin`).setMesh(mesh);
    const steering=doc.createNode(`${key}-steer`).addChild(spin);scene.addChild(steering);
    const b=getBounds(steering), c=b.min.map((v,i)=>(v+b.max[i])/2), radius=(b.max[1]-b.min[1])/2;
    transformMesh(mesh,new Matrix4().makeTranslation(...c.map(v=>-v)).toArray());steering.setTranslation(c);
    steering.setExtras({transportPart:'wheel-steering',front:key.startsWith('front')});
    spin.setExtras({transportPart:'wheel-spin',radiusMeters:radius});wheelLayout.push({id:key,position:c,radius});
  }
  await doc.transform(prune(),dedup(),join({filter:node=>!node.getExtras().transportPart&&!node.getExtras().aircraftRotor}),prune());
  const bytes=await io.writeBinary(doc), filename=recipe.id+'.glb';
  if(bytes.length>7_000_000||triangleCount(doc)>110_000)throw Error(`${recipe.key}: derived model exceeds intake budget (${bytes.length} bytes, ${triangleCount(doc)} triangles).`);
  if(!recipe.aircraft&&wheelLayout.length!==4)throw Error(`${recipe.key}: expected four wheel pivots, found ${wheelLayout.length}.`);
  for(const wheel of wheelLayout)if(Math.abs(wheel.position[0])<recipe.dimensions[0]*.25||Math.abs(wheel.position[2])<recipe.dimensions[2]*.2||!(wheel.radius>.18&&wheel.radius<.55))throw Error(`${recipe.key}: implausible wheel pivot ${wheel.id}.`);
  await writeFile(path.join(outputDir,filename),bytes);
  const sourceLicense=await readFile(path.join(sourceDir,recipe.key,'license.txt'),'utf8');
  if(!sourceLicense.includes('CC-BY-4.0')||!sourceLicense.includes(recipe.uid))throw Error(`${recipe.key}: source license mismatch.`);
  await writeFile(path.join(outputDir,recipe.id+'-LICENSE.txt'),sourceLicense);
  const intake=JSON.parse(await readFile(path.join(sourceDir,recipe.key,'intake.json'),'utf8'));
  const record={id:recipe.id,label:recipe.label,variantId:recipe.variantId||null,sourceUrl:sourceLicense.match(/\* source:\s*(https:\/\/\S+)/)?.[1],attribution:`${recipe.label} by ${recipe.author}`,sourceCredit:sourceLicense.match(/\* author:\s*([^\n]+)/)?.[1],license:'CC-BY-4.0',filename,sourceArchiveSha256:intake.archiveSha256,sha256:hash(bytes),bytes:bytes.length,sourceTriangles,triangles:triangleCount(doc),materials:root.listMaterials().length,textureEdgePixels:512,dimensionsMeters:{width:recipe.dimensions[0],height:recipe.dimensions[1],length:recipe.dimensions[2]},paintMaterialNames:recipe.paint||[],wheelLayout,aircraft:recipe.aircraft===true,modifications:'Offline axis/scale/base normalization; 512px color / 256px data maps; bounded mesh simplification; rigid wheel / Cessna propeller pivots. Adjusted paint/trim roughness and selected body colors. No gameplay simulation imported.'};
  records.push(record);console.log(JSON.stringify({id:record.id,bytes:record.bytes,triangles:record.triangles,materials:record.materials,wheels:wheelLayout.length}));
}
await writeFile(path.join(outputDir,'asset-manifest.json'),JSON.stringify({schemaVersion:1,licenseUrl:'https://creativecommons.org/licenses/by/4.0/',assets:records},null,2)+'\n');
const catalog=records.map(r=>({schemaVersion:1,id:r.id,label:r.label,url:`/app/assets/models/vehicles/explorer-fleet/${r.filename}`,roles:[r.aircraft?'aircraft-presentation':'road-vehicle-presentation'],vehicleVariantIds:r.variantId?[r.variantId]:[],license:r.license,sourceUrl:r.sourceUrl,attribution:r.attribution,sourceCredit:r.sourceCredit,dimensionsMeters:r.dimensionsMeters,paintMaterialNames:r.paintMaterialNames,wheelLayout:r.wheelLayout,sourceUpAxis:'y',rigPolicy:'preserve-parts',collisionPolicy:r.aircraft?'existing-aircraft-catalog-envelope':'existing-road-vehicle-envelope',instancePolicy:{geometry:'shared',materials:'clone'},loadPolicy:{bounded:true,timeoutMs:20000},budgets:{bytes:r.bytes,triangles:r.triangles,textureEdgePixels:r.textureEdgePixels,maxInstances:r.aircraft?5:10}}));
await writeFile(path.join(outputDir,'explorer-fleet-assets.js'),'// Generated by scripts/prepare-explorer-fleet-assets.mjs. Source rights and hashes: bundled asset-manifest.json.\nexport const EXPLORER_FLEET_ASSETS = Object.freeze('+JSON.stringify(catalog,null,2)+'.map(record => Object.freeze(record)));\n');

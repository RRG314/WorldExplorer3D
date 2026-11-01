import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {personalVehicleById,normalizeVehicleGarage} from '../app/js/transport/vehicle-garage-rules.js';
const require=createRequire(import.meta.url),{settleVehicleGarageAction}=require('../functions/economy-authority.js');

test('withdrawn racing prototypes cannot debit a wallet or mutate the real vehicle garage through a stale client',async()=>{
 const original=normalizeVehicleGarage(null),writes=[];
 const runTransaction=fn=>fn({get:async key=>({exists:key!=='receipt',data:()=>key==='progress'?{garage:original}:key==='wallet'?{credits:100000}:null}),set:(...args)=>writes.push(args)});
 for(const vehicleId of ['meridian_gt','apex_clubsport','kestrel_rally']){
  assert.equal(personalVehicleById(vehicleId),null);
  await assert.rejects(settleVehicleGarageAction({runTransaction,walletRef:'wallet',progressRef:'progress',receiptRef:'receipt',uid:'driver',timestampFromMs:n=>n,input:{action:'buy',vehicleId,expectedRevision:0,requestId:'withdrawn:'+vehicleId}}),/vehicle_not_available/);
 }
 assert.deepEqual(writes,[]);assert.deepEqual(original,normalizeVehicleGarage(null));
 assert.equal(personalVehicleById('bmw_e34').assetId,'vehicle-bmw-525i-e34');
 assert.equal(require('../functions/generated/vehicle-garage-rules.cjs').personalVehicleById('bmw_e34').price,0);
});

test('the real M3 derivative keeps its licensed identity, matching geometry, wheel pivots and cabin envelope',async()=>{
 const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
 const {RACING_FLEET_ASSETS}=await import('../app/js/assets/racing-fleet-assets.js');
 const {vehicleDefinitionById,PARKED_VEHICLE_CATALOG}=await import('../app/js/engine/vehicle-catalog.js');
 const {vehicleDriverCamera}=await import('../app/js/transport/vehicle-camera-mount.js');
 const asset=RACING_FLEET_ASSETS.find(a=>a.id==='road-bmw-m3-e46'),car=vehicleDefinitionById('bmw_m3_e46');
 const manifest=JSON.parse(await readFile(new URL('../app/assets/models/vehicles/racing-fleet/asset-manifest.json',import.meta.url))),record=manifest.assets.find(a=>a.id===asset.id);
 const bytes=await readFile(new URL('..'+asset.url,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);assert.equal(bytes.length,asset.budgets.bytes);
 assert.equal(record.license,'CC-BY-4.0');assert.match(record.sourceArchiveSha256,/^[a-f0-9]{64}$/);
 assert.match(record.sourceUrl,/f1b00ff37d504629b10031da32bc7497$/);assert.match(record.sourceCredit,/Márcio Meireles/);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 assert.equal(json.animations?.length||0,0);assert.equal(json.skins?.length||0,0);
 const spin=json.nodes.filter(n=>n.extras?.transportPart==='wheel-spin'),steering=json.nodes.filter(n=>n.extras?.transportPart==='wheel-steering');
 assert.equal(spin.length,4);assert.equal(steering.filter(n=>n.extras.front).length,2);
 assert.equal(json.nodes.filter(n=>n.extras?.transportPart==='wheel-caliper').length,4);
 const displays=json.nodes.filter(n=>n.extras?.vehicleInstrumentDisplay);assert.equal(displays.length,1);assert.equal(displays[0].extras.vehicleInstrumentStyle,'four-dial');
 const face=json.meshes[displays[0].mesh].primitives;assert.equal(face.length,1);assert.ok(Number.isInteger(face[0].attributes.TEXCOORD_0));
 assert.equal(json.accessors[face[0].indices].count,192*3,'original gauge caps retain their source detail');
 for(const n of steering)assert.ok(n.children.some(i=>json.nodes[i].extras?.transportPart==='wheel-spin'));
 assert.ok(!json.buffers.some(b=>b.uri));assert.ok(!(json.images||[]).some(i=>i.uri));
 assert.ok(record.triangles<=110000&&bytes.length<=7000000);assert.equal(car.length,4.493);
 assert.ok(asset.wheelLayout.every(w=>Math.abs(w.position[1]-w.radius)<.003));
 assert.equal(car.assetId,asset.id);assert.ok(!PARKED_VEHICLE_CATALOG.includes(car));assert.equal(vehicleDriverCamera(car).kind,'cabin');
});

test('real M3 purchase, selection and race admission share the canonical asset and debit exactly once',async()=>{
 const rows=new Map([['wallet',{credits:100000,currencyVersion:2}]]),runTransaction=fn=>fn({get:async key=>({exists:rows.has(key),data:()=>rows.get(key)}),set:(key,value)=>rows.set(key,structuredClone(value))});
 const input={action:'buy',vehicleId:'bmw_m3_e46',expectedRevision:0,requestId:'m3:buy',price:1};
 const args={runTransaction,walletRef:'wallet',progressRef:'progress',receiptRef:'receipt',uid:'driver',timestampFromMs:n=>n,nowMs:1000,input};
 const bought=await settleVehicleGarageAction(args);assert.equal(bought.credits,46000);assert.ok(bought.garage.vehicles.bmw_m3_e46);
 assert.equal((await settleVehicleGarageAction(args)).duplicate,true);assert.equal(rows.get('wallet').credits,46000);
 const {prepareVehicleGarageChange}=await import('../app/js/transport/vehicle-garage-rules.js');
 const selected=prepareVehicleGarageChange(bought.garage,{action:'select',vehicleId:'bmw_m3_e46',expectedRevision:bought.garage.revision}).garage;
 assert.equal(selected.selectedId,'bmw_m3_e46');assert.equal(require('../functions/generated/racing-engine.cjs').createRaceVehicleProfile('bmw_m3_e46').handling.assetId,'road-bmw-m3-e46');
});

test('the E92 racing derivative retains its CC0 source, four wheel assemblies and prepared telemetry cabin',async()=>{
 const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
 const {RACING_FLEET_ASSETS}=await import('../app/js/assets/racing-fleet-assets.js');
 const {vehicleDefinitionById,PARKED_VEHICLE_CATALOG}=await import('../app/js/engine/vehicle-catalog.js');
 const {vehicleDriverCamera}=await import('../app/js/transport/vehicle-camera-mount.js');
 const asset=RACING_FLEET_ASSETS.find(a=>a.id==='road-bmw-m3-e92-race'),car=vehicleDefinitionById('bmw_m3_e92_race');
 const manifest=JSON.parse(await readFile(new URL('../app/assets/models/vehicles/racing-fleet/asset-manifest.json',import.meta.url))),record=manifest.assets.find(a=>a.id===asset.id);
 const bytes=await readFile(new URL('..'+asset.url,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
 const {getModelAsset}=await import('../app/js/assets/model-asset-catalog.js');
 const {modelAssetRequestUrl}=await import('../app/js/assets/model-asset-url.js');
 assert.equal(modelAssetRequestUrl(getModelAsset(asset.id)),asset.url+'?revision='+record.sha256.slice(0,16));
 assert.equal(record.sourceArchiveSha256,'e2193befa1da6a7394b3eadee3704727290a1c2520108fe909827c6052e0417f');
 assert.equal(record.sourceBlendSha256,'d13417a226c00ddfd1b14711431f66cbe98d588412e1c74ca77d91f6f829a143');
 assert.equal(record.license,'CC0-1.0');assert.equal(record.sourceUrl,'https://blendswap.com/blend/3697');
 const licence=await readFile(new URL('../app/assets/models/vehicles/racing-fleet/road-bmw-m3-e92-race-LICENSE.txt',import.meta.url),'utf8');
 assert.match(licence,/Creative Commons Zero/);assert.doesNotMatch(licence,/NOT ALLOWED TO USE IT COMMERCIALLY/);
 const text=bytes.subarray(20,20+bytes.readUInt32LE(12)).toString(),json=JSON.parse(text);
 assert.doesNotMatch(text,/Game\.py|M-Power|Side_Texturen|BMW_GT3_Car_Logos/);
 assert.equal(json.nodes.filter(n=>n.extras?.transportPart==='wheel-spin').length,4);
 assert.equal(json.nodes.filter(n=>n.extras?.transportPart==='wheel-caliper').length,4);
 assert.equal(json.nodes.filter(n=>n.extras?.transportPart==='wheel-steering'&&n.extras.front).length,2);
 assert.equal(json.nodes.filter(n=>n.extras?.vehicleInstrumentDisplay===true).length,1);
 const {NodeIO}=await import('@gltf-transform/core'),{ALL_EXTENSIONS}=await import('@gltf-transform/extensions');
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
 const screen=doc.getRoot().listNodes().find(n=>n.getExtras().vehicleInstrumentDisplay).getMesh().listPrimitives()[0];
 const positions=screen.getAttribute('POSITION'),uv=screen.getAttribute('TEXCOORD_0');
 for(let i=0;i<positions.getCount();i++){
  const [x,y]=positions.getElement(i,[]),[u]=uv.getElement(i,[]);
  assert.ok(y>.82&&y<.94,'display remains in the reviewed lower cabin envelope');
  assert.equal(u,x>.34?0:1,'seat looking forward reads text left to right');
 }
 const T=await import('three'),{GLTFLoader}=await import('three/examples/jsm/loaders/GLTFLoader.js');
 const {scene}=await new Promise((resolve,reject)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));
 scene.updateMatrixWorld(true);
 for(const degrees of [0,5,10,15]){
  const angle=degrees*Math.PI/180;
  const ray=new T.Raycaster(new T.Vector3(...asset.driverEyeGroundMeters),new T.Vector3(0,Math.sin(angle),Math.cos(angle)),.03,2.2);
  const obstruction=ray.intersectObject(scene,true).find(hit=>!(Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material).transparent);
  assert.equal(obstruction,undefined,`driver windshield aperture obstructed at ${degrees} degrees above the road`);
 }
 assert.equal(json.animations?.length||0,0);assert.equal(json.skins?.length||0,0);
 assert.ok(!json.buffers.some(b=>b.uri));assert.ok(!(json.images||[]).some(i=>i.uri));
 assert.equal(bytes.length,asset.budgets.bytes);assert.ok(record.triangles<=110000&&bytes.length<=7000000);
 assert.ok(asset.wheelLayout.every(w=>Math.abs(w.position[1]-w.radius)<.003));
 assert.equal(car.assetId,asset.id);assert.equal(car.length,4.634);assert.equal(car.seatCount,1);
 assert.ok(!PARKED_VEHICLE_CATALOG.includes(car));assert.equal(vehicleDriverCamera(car).kind,'cabin');
});

test('the real E92 racing car shares authoritative acquisition and the service vehicle profile',async()=>{
 const rows=new Map([['wallet',{credits:200000,currencyVersion:2}]]),runTransaction=fn=>fn({get:async key=>({exists:rows.has(key),data:()=>rows.get(key)}),set:(key,value)=>rows.set(key,structuredClone(value))});
 const args={runTransaction,walletRef:'wallet',progressRef:'progress',receiptRef:'receipt',uid:'driver',timestampFromMs:n=>n,nowMs:1000,
  input:{action:'buy',vehicleId:'bmw_m3_e92_race',expectedRevision:0,requestId:'e92:buy',price:1}};
 const bought=await settleVehicleGarageAction(args);assert.equal(bought.credits,70000);
 assert.equal((await settleVehicleGarageAction(args)).duplicate,true);assert.equal(rows.get('wallet').credits,70000);
 const {prepareVehicleGarageChange}=await import('../app/js/transport/vehicle-garage-rules.js');
 const garage=prepareVehicleGarageChange(bought.garage,{action:'select',vehicleId:'bmw_m3_e92_race',expectedRevision:bought.garage.revision}).garage;
 assert.equal(garage.selectedId,'bmw_m3_e92_race');
 const engine=require('../functions/generated/racing-engine.cjs');
 const profile=engine.createRaceVehicleProfile(garage.selectedId,{condition:.8,levels:{engine:1}});
 assert.equal(profile.handling.assetId,'road-bmw-m3-e92-race');assert.equal(profile.conditionValue,.8);
 assert.equal(require('../functions/generated/vehicle-garage-rules.cjs').personalVehicleById(garage.selectedId).price,130000);
});

test('the Porsche derivative keeps its share-alike identity, rigid wheels, content revision and prepared cabin',async()=>{
 const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
 const {RACING_FLEET_ASSETS}=await import('../app/js/assets/racing-fleet-assets.js');
 const {vehicleDefinitionById,PARKED_VEHICLE_CATALOG}=await import('../app/js/engine/vehicle-catalog.js');
 const {getModelAsset}=await import('../app/js/assets/model-asset-catalog.js');
 const {modelAssetRequestUrl}=await import('../app/js/assets/model-asset-url.js');
 const {vehicleDriverCamera}=await import('../app/js/transport/vehicle-camera-mount.js');
 const asset=RACING_FLEET_ASSETS.find(a=>a.id==='road-porsche-911-carrera-4s'),car=vehicleDefinitionById('porsche_carrera_4s');
 const manifest=JSON.parse(await readFile(new URL('../app/assets/models/vehicles/racing-fleet/asset-manifest.json',import.meta.url))),record=manifest.assets.find(a=>a.id===asset.id);
 const bytes=await readFile(new URL('..'+asset.url,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
 assert.equal(record.sourceArchiveSha256,'57731111fbb0d6958df64454e9ba51939fefd39ab48e55f423a0bb2d76918454');
 assert.equal(record.license,'CC-BY-SA-4.0');assert.match(record.sourceCredit,/Karol Miklas/);
 assert.equal(modelAssetRequestUrl(getModelAsset(asset.id)),asset.url+'?revision='+record.sha256.slice(0,16));
 const licence=await readFile(new URL('../app/assets/models/vehicles/racing-fleet/road-porsche-911-carrera-4s-LICENSE.txt',import.meta.url),'utf8');
 assert.match(licence,/Modified versions must have the same license/);assert.match(licence,/Commercial use is allowed/);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 assert.equal(json.nodes.filter(n=>n.extras?.transportPart==='wheel-spin').length,4);
 assert.equal(json.nodes.filter(n=>n.extras?.transportPart==='wheel-caliper').length,4);
 assert.equal(json.nodes.filter(n=>n.extras?.transportPart==='wheel-steering'&&n.extras.front).length,2);
 const screen=json.nodes.find(n=>n.extras?.vehicleInstrumentDisplay===true);assert.equal(screen.extras.vehicleInstrumentStyle,'five-dial');
 const {NodeIO}=await import('@gltf-transform/core'),{ALL_EXTENSIONS}=await import('@gltf-transform/extensions');
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
 const face=doc.getRoot().listNodes().find(n=>n.getExtras().vehicleInstrumentDisplay).getMesh().listPrimitives()[0];
 const uv=face.getAttribute('TEXCOORD_0');assert.ok(uv,'live atlas retains its exported binding');
 assert.equal(uv.getCount(),face.getAttribute('POSITION').getCount());
 const values=Array.from({length:uv.getCount()},(_,i)=>uv.getElement(i,[]));
 assert.ok(Math.max(...values.map(v=>v[0]))-Math.min(...values.map(v=>v[0]))>.9);
 assert.ok(Math.max(...values.map(v=>v[1]))-Math.min(...values.map(v=>v[1]))>.5);
 assert.ok(!json.materials.some(m=>['coat','Material'].includes(m.name)));
 assert.equal(json.animations?.length||0,0);assert.equal(json.skins?.length||0,0);
 assert.ok(!json.buffers.some(b=>b.uri));assert.ok(!(json.images||[]).some(i=>i.uri));
 assert.equal(bytes.length,asset.budgets.bytes);assert.ok(record.triangles<=110000&&bytes.length<=7000000);
 assert.ok(asset.wheelLayout.every(w=>Math.abs(w.position[1]-w.radius)<.003));
 assert.equal(car.assetId,asset.id);assert.equal(car.length,4.435);assert.equal(car.seatCount,4);
 assert.ok(!PARKED_VEHICLE_CATALOG.includes(car));assert.equal(vehicleDriverCamera(car).kind,'cabin');
});

test('the Porsche shares authoritative garage acquisition and the service race profile',async()=>{
 const rows=new Map([['wallet',{credits:170000,currencyVersion:2}]]),runTransaction=fn=>fn({get:async key=>({exists:rows.has(key),data:()=>rows.get(key)}),set:(key,value)=>rows.set(key,structuredClone(value))});
 const args={runTransaction,walletRef:'wallet',progressRef:'progress',receiptRef:'receipt',uid:'driver',timestampFromMs:n=>n,nowMs:1000,
  input:{action:'buy',vehicleId:'porsche_carrera_4s',expectedRevision:0,requestId:'carrera:buy',price:1}};
 const bought=await settleVehicleGarageAction(args);assert.equal(bought.credits,85000);
 assert.equal((await settleVehicleGarageAction(args)).duplicate,true);assert.equal(rows.get('wallet').credits,85000);
 const {prepareVehicleGarageChange}=await import('../app/js/transport/vehicle-garage-rules.js');
 const garage=prepareVehicleGarageChange(bought.garage,{action:'select',vehicleId:'porsche_carrera_4s',expectedRevision:bought.garage.revision}).garage;
 assert.equal(garage.selectedId,'porsche_carrera_4s');
 const engine=require('../functions/generated/racing-engine.cjs');
 assert.equal(engine.createRaceVehicleProfile(garage.selectedId,{condition:.7,levels:{engine:1}}).handling.assetId,'road-porsche-911-carrera-4s');
 assert.equal(require('../functions/generated/vehicle-garage-rules.cjs').personalVehicleById(garage.selectedId).price,85000);
});

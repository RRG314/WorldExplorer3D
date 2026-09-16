// Exercises the actual packaged modules with a Web Worker message adapter.
// This is a protocol/build test, not a WebGL or browser performance test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

const root=path.resolve(process.env.WE3D_VERIFY_ROOT || 'dist');
const manifest=JSON.parse(await fs.readFile(path.join(root,'build-manifest.json'),'utf8'));
const html=await fs.readFile(path.join(root,'app/index.html'),'utf8');
const input={metersPerWorldUnit:1,roads:[{width:8,type:'residential',pts:[{x:5,z:20},{x:55,z:20}],
  transportRecord:{sourceTags:{highway:'residential',sidewalk:'both'}}}],buildings:[],landuses:[],linearFeatures:[]};
const results=[];
for(const [entry,configKey] of [['street-pavement-worker','streetPavementWorkerUrl'],['street-overview-worker','streetOverviewWorkerUrl']]){
  const relative=manifest.runtimePackaging.entries[entry];
  assert.ok(relative,`missing manifest entry ${entry}`);
  assert.ok(html.includes(JSON.stringify(configKey)+': '+JSON.stringify('/app/'+relative)),`missing worker URL ${entry}`);
  const url=pathToFileURL(path.join(root,'app',relative)).href;
  const adapter=`const {parentPort,workerData}=require('node:worker_threads');
    globalThis.self={postMessage:(value,transfer)=>parentPort.postMessage(value,transfer)};
    import(workerData).then(()=>{parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({type:'ready'});});`;
  const worker=new Worker(adapter,{eval:true,workerData:url});
  let pending;
  const receive=()=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending=null;reject(new Error(`${entry}: protocol timeout`));},10000);
    pending={resolve:value=>{clearTimeout(timer);pending=null;resolve(value);},reject:error=>{clearTimeout(timer);pending=null;reject(error);}};
  });
  worker.on('message',message=>message.type==='error'?pending?.reject(new Error(message.message)):pending?.resolve(message));
  worker.on('error',error=>pending?.reject(error));
  const request=async data=>{const response=receive();worker.postMessage(data);return response;};
  try{
    assert.equal((await receive()).type,'ready');
    const prepared=await request({type:'prepare',input});
    assert.equal(prepared.type,'prepared');assert.ok(prepared.tiles>0);
    let nonempty=0,tiles=0;
    for(let i=0;i<=prepared.tiles;i++){
      const packet=await request({type:'next',focus:{x:20,z:20},resolution:32});
      if(packet.type==='complete')break;
      assert.equal(packet.type,'tile');tiles++;
      if(entry==='street-pavement-worker'){
        assert.ok(packet.mesh.vertices.every(Number.isFinite));
        if(packet.mesh.vertices.length)nonempty++;
      }else{assert.equal(packet.mask.length,1024);if(packet.mask.some(n=>n>0))nonempty++;}
    }
    assert.equal(tiles,prepared.tiles);assert.ok(nonempty>0,`${entry} must generate pavement`);
    results.push({entry,tiles,nonempty,ok:true});
  }finally{await worker.terminate();}
}
console.log(JSON.stringify({ok:true,buildId:manifest.buildId,evidence:'packaged worker protocol in Node adapter',results},null,2));

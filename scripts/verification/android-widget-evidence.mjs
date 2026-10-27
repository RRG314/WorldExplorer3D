import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function captureIndex(bytes) {
  assert.ok(bytes.length > 0 && bytes.length <= 65536, 'Invalid screenshot index size');
  const index=JSON.parse(bytes.toString());
  assert.equal(index.schemaVersion,1);
  assert.ok(Array.isArray(index.screenshots)&&index.screenshots.length>0&&index.screenshots.length<=16,'Invalid screenshot count');
  const seen=new Set();let total=0;
  return index.screenshots.map(row=>{
    assert.ok(typeof row.name==='string'&&/^[a-z0-9][a-z0-9-]{0,79}\.png$/.test(row.name)&&!seen.has(row.name),'Invalid or duplicate screenshot name');seen.add(row.name);
    assert.ok(Number.isInteger(row.bytes)&&row.bytes>=33&&row.bytes<=4*1024*1024,'Invalid screenshot byte budget');
    assert.ok([row.width,row.height].every(value=>Number.isInteger(value)&&value>0&&value<=4096),'Invalid screenshot dimensions');
    total+=row.bytes;assert.ok(total<=20*1024*1024,'Screenshot collection exceeds budget');
    return {name:row.name,bytes:row.bytes,width:row.width,height:row.height};
  });
}
export function capturePayload(row,bytes) {
  assert.equal(bytes.length,row.bytes,'Incomplete screenshot export');
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Invalid PNG');
  assert.equal(bytes.subarray(12,16).toString(),'IHDR');
  assert.equal(bytes.readUInt32BE(16),row.width);assert.equal(bytes.readUInt32BE(20),row.height);
  return {...row,sha256:createHash('sha256').update(bytes).digest('hex')};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  // Only this fresh staging app's declared captures. No arbitrary file paths,
  // shell interpolation, credentials, app databases or whole-device snapshots.
  const read=(name,maxBuffer)=>execFileSync('adb',['exec-out','run-as','io.worldexplorer3d.app.staging','cat','files/portal-evidence/'+name],{maxBuffer,timeout:15000});
  const rows=captureIndex(read('index.json',65536)),exported=[];
  for(const row of rows){const bytes=read(row.name,4*1024*1024);exported.push(capturePayload(row,bytes));await fs.writeFile('android-widget-evidence/'+row.name,bytes);}
  await fs.writeFile('android-widget-evidence/screenshots.json',JSON.stringify({schemaVersion:1,screenshots:exported},null,2)+'\n');
  console.log(JSON.stringify({exported:exported.length,bytes:exported.reduce((sum,row)=>sum+row.bytes,0)}));
}

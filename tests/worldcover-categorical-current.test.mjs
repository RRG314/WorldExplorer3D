import test from 'node:test';
import assert from 'node:assert/strict';
import {worldCoverSourceTile,readWorldCoverClasses} from '../scripts/lib/worldcover-categorical.mjs';
test('categorical tile names use southwest source origin across hemispheres',()=>{
 assert.equal(worldCoverSourceTile(39.29,-76.61).id,'N39W078');
 assert.equal(worldCoverSourceTile(-2.1,-59.9).id,'S03W060');
 assert.equal(worldCoverSourceTile(0,-.01).id,'N00W003');
});
test('cross-border windows preserve class bytes and placement without RGB interpolation',async()=>{
 const calls=[];
 const decoder={fromUrl:async(url,options)=>{assert.equal(options.allowFullFile,false);return {readRasters:async o=>{calls.push(o);assert.equal(o.resampleMethod,'nearest');return new Uint8Array(o.width*o.height).fill(url.includes('E000')?10:70);}};}};
 const data=await readWorldCoverClasses({latS:1,latN:2,lonW:-1,lonE:1},4,null,decoder);
 assert.equal(calls.length,2);assert.deepEqual([...data],[70,70,10,10,70,70,10,10,70,70,10,10,70,70,10,10]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/js/multiplayer/ui-room-pose.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/export \{[^}]+\};/g,'');
function world(overrides) {
 const context=vm.createContext({appCtx:{LOC:{lat:1,lon:2},...overrides},finiteNumber:(n,f)=>Number.isFinite(n)?n:f,sanitizeText:s=>s});
 vm.runInContext(source,context);
 return vm.runInContext('readWorldContext()',context);
}
test('rooms created from Space or Moon title selection use that world before runtime activation',()=>{
 for(const kind of ['space','moon'])assert.equal(world({gameStarted:false,loadingScreenMode:kind}).kind,kind);
 assert.equal(world({gameStarted:false,loadingScreenMode:'earth'}).kind,'earth');
});
test('active gameplay owns the room world even when a previous title selection differs',()=>{
 assert.equal(world({gameStarted:true,loadingScreenMode:'space'}).kind,'earth');
 assert.equal(world({gameStarted:true,spaceFlight:{active:true},loadingScreenMode:'earth'}).kind,'space');
 assert.equal(world({gameStarted:true,onMoon:true,loadingScreenMode:'earth'}).kind,'moon');
});

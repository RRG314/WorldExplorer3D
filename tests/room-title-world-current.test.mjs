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

test('a new title room uses selected custom coordinates instead of the previously loaded world',()=>{
 const selected={lat:43.7384,lon:7.4246,name:'Monaco'};
 const actual=world({gameStarted:false,selLoc:'custom',customLoc:selected});
 assert.equal(actual.lat,selected.lat);assert.equal(actual.lon,selected.lon);
 assert.equal(actual.seed,'latlon:43.73840,7.42460');assert.equal(actual.name,'Monaco');
});
test('a new title room uses the selected preset before that world has loaded',()=>{
 const actual=world({gameStarted:false,selLoc:'london',LOCS:{london:{lat:51.5074,lon:-.1278,name:'London'}}});
 assert.equal(actual.lat,51.5074);assert.equal(actual.lon,-.1278);assert.equal(actual.name,'London');
});
test('the location selection authority determines new title room coordinates',()=>{
 const actual=world({gameStarted:false,selLoc:'custom',customLoc:{lat:3,lon:4},resolveLocationSelection:()=>({lat:5,lon:6,name:'Selected place'})});
 assert.equal(actual.lat,5);assert.equal(actual.lon,6);assert.equal(actual.name,'Selected place');
});
test('active gameplay room coordinates stay bound to the loaded world',()=>{
 const actual=world({gameStarted:true,LOC:{lat:1,lon:2,name:'Loaded world'},selLoc:'custom',customLoc:{lat:3,lon:4,name:'Other selection'}});
 assert.equal(actual.lat,1);assert.equal(actual.lon,2);assert.equal(actual.name,'Loaded world');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../app/js/app-shell-fragments.js',import.meta.url),'utf8');
const start=source.indexOf('async function publishImmutableBuildIdentity()'), end=source.indexOf('\nfunction ensureAppShellFragments()',start);
const publish=source.slice(start,end);
async function run({loaded,manifest,offline=false}) {
  const hud={dataset:{},title:''}, context=vm.createContext({document:{querySelector:()=>hud},__WORLD_EXPLORER_PRODUCTION__:loaded,
    fetch:async()=>{if(offline)throw Error('offline');return{ok:true,json:async()=>manifest};}});
  await vm.runInContext(`${publish}\npublishImmutableBuildIdentity()`,context);
  return{hud,identity:context.__WORLD_EXPLORER_BUILD__};
}
test('an open page labels its loaded source and never borrows the next deployment identity',async()=>{
  const loaded={sourceVersion:'5.6.1',sourceCommit:'1'.repeat(40),runtimeReleaseId:'old'};
  const manifest={version:'5.6.1',commit:'2'.repeat(40),candidateId:'new-build',buildId:'new-build',runtimePackaging:{generation:{id:'new'}}};
  const next=await run({loaded,manifest});assert.equal(next.hud.dataset.buildLabel,'V5.6.1 · 1111111');assert.equal(next.identity,undefined);assert.match(next.hud.title,/update is available/);
  const offline=await run({loaded,offline:true});assert.equal(offline.hud.dataset.buildLabel,'V5.6.1 · 1111111');assert.equal(offline.identity,undefined);
});
test('a matching deployed generation publishes its exact manifest identity',async()=>{
  const manifest={version:'5.6.1',commit:'1'.repeat(40),candidateId:'exact-build',buildId:'exact-build',runtimePackaging:{generation:{id:'current'}}};
  const {hud,identity}=await run({loaded:{sourceVersion:manifest.version,sourceCommit:manifest.commit,runtimeReleaseId:'current'},manifest});
  assert.equal(identity.buildId,'exact-build');assert.equal(hud.title,'exact-build');assert.equal(hud.dataset.buildLabel,'V5.6.1 · 1111111');
});

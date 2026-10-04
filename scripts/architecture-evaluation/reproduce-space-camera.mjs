// Actual space camera function + pinned Three math. No renderer or browser.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {ctx} from '../../app/js/shared-context.js?v=55';
import {configureSpaceRuntimeDependencies,updateSpaceFlightCamera} from '../../app/js/space/runtime.js';
configureSpaceRuntimeDependencies({THREE});
const rows=[];
for(const fps of [30,60,120]){
  ctx.spaceFlight={overviewMode:'inner',camera:new THREE.PerspectiveCamera(),rocket:new THREE.Object3D(),_frameScale:60/fps};
  for(let i=0;i<fps/3;i++)updateSpaceFlightCamera();
  const target=new THREE.Vector3(0,5600,7200);
  rows.push({fps,elapsedSeconds:1/3,remainingDistance:ctx.spaceFlight.camera.position.distanceTo(target),remainingFraction:ctx.spaceFlight.camera.position.distanceTo(target)/target.length()});
}
assert.ok(rows[0].remainingDistance>rows[2].remainingDistance*10);
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Actual space camera function with installed pinned Three math. Fixed-target overview camera at three simulated presentation cadences; no browser or performance measurement.',rows,observed:'Camera converges per frame, not per elapsed second. At the same elapsed time, 30 FPS leaves over ten times the distance remaining at 120 FPS.'};
await fs.mkdir('docs/system-review/2026-10-04',{recursive:true});await fs.writeFile('docs/system-review/2026-10-04/space-camera-reproduction.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

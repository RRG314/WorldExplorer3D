import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveBoatCameraFraming } from '../app/js/hud/boat-camera.js';

test('large ships use a bounded navigation camera in harbors and channels', () => {
  const channel = resolveBoatCameraFraming({
    waterKind: 'channel', classLength: 290, classHeight: 34,
    speedNorm: 1, waveIntensity: .4
  });
  const ocean = resolveBoatCameraFraming({
    waterKind: 'open_ocean', classLength: 290, classHeight: 34,
    speedNorm: 1, waveIntensity: .4
  });
  assert.ok(channel.chaseDistance > channel.classLength * .5 + 4);
  assert.ok(channel.chaseDistance < ocean.chaseDistance);
  assert.ok(channel.lookAhead > channel.classLength * .5 + 15);
  assert.ok(channel.chaseHeight >= channel.classHeight * .8);
});

test('small boats retain a close readable chase view in a harbor', () => {
  const framing = resolveBoatCameraFraming({
    waterKind: 'harbor', classLength: 7, classHeight: 2,
    speedNorm: .5, waveIntensity: .3
  });
  assert.ok(framing.chaseDistance >= 9 && framing.chaseDistance < 12);
  assert.ok(framing.lookAhead >= 10 && framing.lookAhead < 14);
});

// Shared vessel overview uses admitted dimensions rather than a speedboat-sized camera.
test('vessel overview fits research and cargo silhouettes on desktop and phone',async()=>{
 const THREE=await import('three'),{resolveBoatOverviewFraming}=await import('../app/js/hud/boat-camera.js');
 for(const [length,width,height] of [[8,3,3],[82,15,28],[300,42,60]])for(const aspect of [16/9,390/844]){
  const f=resolveBoatOverviewFraming({length,width,height,fov:60,aspect}),camera=new THREE.PerspectiveCamera(60,aspect,.1,10000);camera.position.set(0,f.targetY+f.height,f.back);camera.lookAt(0,f.targetY,0);camera.updateMatrixWorld();
  for(const x of [-width/2,width/2])for(const y of [0,height])for(const z of [-length/2,length/2]){const p=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z<1);}
 }
});

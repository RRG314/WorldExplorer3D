import assert from 'node:assert/strict';
import test from 'node:test';

import { ctx } from '../app/js/shared-context.js?v=55';
import { sampleInteriorWalkSurface, nearestInteriorInteraction } from '../app/js/interiors/runtime.js?v=12';
import { interiorFloorElevation } from '../app/js/interiors/floor-model.js';
import { elevatorFloorChoices } from '../app/js/interiors/elevator-authority.js';

const deps = {
  finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
  pointInPolygonSafe(x, z, polygon) {
    return x >= polygon[0].x && x <= polygon[2].x && z >= polygon[0].z && z <= polygon[2].z;
  }
};

const floor = {
  kind: 'polygon',
  y: 0,
  pts: [
    { x: -2, z: -2 },
    { x: 12, z: -2 },
    { x: 12, z: 2 },
    { x: -2, z: 2 }
  ]
};

const stairs = {
  kind: 'ramp',
  start: { x: 0, z: 0 },
  end: { x: 10, z: 0 },
  yStart: 0,
  yEnd: 3.4,
  halfWidth: 1
};

test('interior stairs own an overlapping floor only when vertically continuous with the walker', () => {
  const previousInterior = ctx.activeInterior;
  try {
    ctx.activeInterior = {
      activeLevel: 0,
      floorBaseY: 0,
      floorPlan: { storyHeight: 3.4 },
      // Keep the flat floor first to prove the result does not depend on array order.
      walkSurfaces: [floor, stairs]
    };

    const climbing = sampleInteriorWalkSurface(2, 0, 0.66, deps);
    assert.equal(climbing?.source, 'interior_stairs');
    assert.ok(Math.abs(climbing.y - 0.68) < 0.001);

    const descending = sampleInteriorWalkSurface(8, 0, 2.75, deps);
    assert.equal(descending?.source, 'interior_stairs');
    assert.ok(Math.abs(descending.y - 2.72) < 0.001);

    const distantMidRamp = sampleInteriorWalkSurface(5, 0, 0, deps);
    assert.equal(distantMidRamp?.source, 'interior');
    assert.equal(distantMidRamp?.y, 0);
  } finally {
    ctx.activeInterior = previousInterior;
  }
});

test('unequal authored viewing floors use physical elevations for controls and surface recovery',()=>{
  const previousInterior=ctx.activeInterior,previousWalk=ctx.Walk;
  const floors=[{id:'arrival',label:'Arrival',level:0,elevation:0},
    {id:'view',label:'Reef viewing',level:1,elevation:5.2},
    {id:'upper',label:'Upper overlook',level:2,elevation:9.8}];
  const plan={authored:true,floorCount:3,storyHeight:3.4,floors};
  const active={floorBaseY:100,activeLevel:2,floorPlan:plan,
    interactions:floors.map((f,level)=>({kind:'study',id:f.id,level,x:0,z:0,radius:2})),
    walkSurfaces:floors.map(f=>({...floor,y:100+f.elevation}))};
  try{
    ctx.activeInterior=active;ctx.Walk={CFG:{eyeHeight:1.7},state:{}};
    assert.equal(interiorFloorElevation(plan,2),9.8);
    assert.equal(nearestInteriorInteraction(active,{x:0,z:0,y:111.5}).id,'upper');
    assert.equal(nearestInteriorInteraction(active,{x:0,z:0,y:106.9}).id,'view');
    assert.equal(nearestInteriorInteraction(active,{x:0,z:0,y:108.5}),null,'A uniform-story height must not trigger another floor');
    assert.equal(sampleInteriorWalkSurface(0,0,undefined,deps).y,109.8);
    assert.deepEqual(elevatorFloorChoices(plan,1).map(f=>f.label),['Arrival','Reef viewing','Upper overlook']);
    assert.ok(Number.isNaN(interiorFloorElevation(plan,3)));
    assert.ok(Number.isNaN(interiorFloorElevation({...plan,floors:[floors[0],{id:'broken'},floors[2]]},1)));
    active.interactions=[{kind:'study',id:'bad-floor',level:20,x:0,z:0,radius:2}];
    assert.equal(nearestInteriorInteraction(active,{x:0,z:0,y:111.5}),null);
  }finally{ctx.activeInterior=previousInterior;ctx.Walk=previousWalk;}
});

test('generated buildings retain their uniform floor spacing and labels',()=>{
  const plan={floorCount:4,storyHeight:3.4};
  assert.equal(interiorFloorElevation(plan,3),10.2);
  assert.equal(elevatorFloorChoices(plan,3)[3].label,'Floor 4');
});

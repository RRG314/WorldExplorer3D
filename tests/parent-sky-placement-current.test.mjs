import test from 'node:test';
import assert from 'node:assert/strict';
import {parentSkyPlacement} from '../app/js/planetary/parent-sky-placement.js';
import {getAstronomicalBody} from '../app/js/astronomy/body-catalog.js';
function at(id,latitudeDeg,longitudeDeg){const b=getAstronomicalBody(id),p=getAstronomicalBody(b.parentId);return parentSkyPlacement({latitudeDeg,longitudeDeg,bodyRadiusM:b.physical.meanRadiusM,parentRadiusM:p.physical.meanRadiusM,parentMassKg:p.physical.massKg,bodyMassKg:b.physical.massKg,orbitalPeriodS:b.physical.orbitalPeriodS});}
test('Moon parent has physical apparent size and is below the far-side horizon',()=>{
 const near=at('moon',.67408,23.47297);assert.ok(near.direction.y>.9);assert.ok(near.angularDiameterDeg>1.8&&near.angularDiameterDeg<2);
 assert.ok(at('moon',0,180).direction.y<0);assert.ok(at('moon',90,0).direction.y<0);
 assert.ok(Math.abs(Math.hypot(...Object.values(near.direction))-1)<1e-12);
});
test('Europa Jupiter angular size is about twelve degrees, not an arbitrary billboard',()=>{
 const view=at('europa',0,0);assert.ok(view.angularDiameterDeg>11&&view.angularDiameterDeg<13);assert.ok(view.distanceM>660e6&&view.distanceM<680e6);
});

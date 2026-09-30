import test from 'node:test';
import assert from 'node:assert/strict';
import { convertTilesToElements } from '../app/js/world/overture-building-source.js';
import { resolveMappedRoof } from '../app/js/world/mapped-roof-geometry.js';

const footprint = [{x:0,z:0},{x:10,z:0},{x:10,z:8},{x:0,z:8}];
function converted(properties, layerName = 'building') {
  const feature = {toGeoJSON: () => ({properties, geometry: {
    type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]]
  }})};
  return convertTilesToElements([{z:14,x:0,y:0,tile:{layers:{
    [layerName]: {length:1,feature:()=>feature}
  }}}]).elements.find(element => element.type === 'way').tags;
}

test('specific provider use survives import without losing the broad category', () => {
  const tags = converted({id:'house-1',subtype:'residential',class:'detached',height:7,roof_shape:'flat'});
  assert.equal(tags.building, 'detached');
  assert.equal(tags._overtureSubtype, 'residential');
  assert.equal(tags._overtureClass, 'detached');
  assert.equal(tags.height, '7');
  assert.equal(tags['roof:shape'], 'flat');
  assert.equal(resolveMappedRoof(tags,7,null,footprint), null);
  assert.equal(converted({subtype:'residential'}).building, 'residential');
  assert.equal(converted({}).building, 'yes');
  assert.equal(converted({subtype:'residential',class:'apartments'},'building_part')['building:part'], 'apartments');
});

test('explicit flat and unsupported mapped roofs are never replaced by inferred gables', () => {
  for (const shape of ['flat',' FLAT ', 'sawtooth', 'saltbox', 'unrecognised']) {
    assert.equal(resolveMappedRoof({building:'house','roof:shape':shape},7,null,footprint), null);
  }
  const inferred = resolveMappedRoof({building:'house'},7,null,footprint);
  assert.equal(inferred.shape, 'gabled');
  assert.match(inferred.roofShapeSource, /^context_/);
  assert.equal(inferred.wallHeight + inferred.roofHeight, 7);
});

test('Overture half_hipped spelling preserves mapped roof authority and total height', () => {
  const tags = converted({subtype:'residential',class:'detached',roof_shape:'half_hipped',roof_height:2});
  const roof = resolveMappedRoof(tags,7,null,footprint);
  assert.equal(roof.shape, 'half-hipped');
  assert.equal(roof.roofShapeSource, 'mapped');
  assert.equal(roof.roofHeightSource, 'mapped');
  assert.equal(roof.roofHeight,2);
  assert.equal(roof.wallHeight,5);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackpackModel} from '../app/js/player/backpack-model.js';

test('same-instance updates retain precedence and original insertion order among duplicate event rows',()=>{
  const model=createBackpackModel();
  const put=(instanceId,sourceEventId,catalogId='specimen')=>model.upsertItem({instanceId,sourceEventId,catalogId});
  assert.equal(put('first','one'),'first');assert.equal(put('second','two'),'second');
  assert.equal(put('second','one'),'second');
  assert.equal(put('retry','one'),'first');assert.equal(model.item('retry').instanceId,'first');
  assert.equal(put('first','three'),'first');assert.equal(put('retry-two','one'),'second');
  assert.equal(put('first','one'),'first');
  assert.equal(put('retry-three','one'),'first','Rejoining a bucket must preserve Map insertion precedence');
  assert.equal(model.consume('first'),true);
  assert.equal(put('retry-four','one'),'second');
  assert.equal(model.item('specimen').instanceId,'second');
  assert.equal(model.consume('second'),true);
  assert.equal(model.item('retry-four'),null,'Consumed canonical items leave no resolvable aliases');
});

test('event identity is a pair and cannot collide through delimiter characters',()=>{
  const model=createBackpackModel();
  assert.equal(model.upsertItem({instanceId:'a',catalogId:'c',sourceEventId:'a\0b'}),'a');
  assert.equal(model.upsertItem({instanceId:'b',catalogId:'b\0c',sourceEventId:'a'}),'b');
  assert.equal(model.upsertItem({instanceId:'retry-a',catalogId:'c',sourceEventId:'a\0b'}),'a');
  assert.equal(model.upsertItem({instanceId:'retry-b',catalogId:'b\0c',sourceEventId:'a'}),'b');
  assert.equal(model.exportState().items.length,2);
});

test('catalog and event lookup follow a reference ordered map across replacement, removal and reinsertion',()=>{
  const model=createBackpackModel(),reference=new Map();let seed=173;
  const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  for(let i=0;i<4000;i++){
    const instanceId=`item:${random(128)}`;
    if(random(5)===0){
      const removed=reference.size?[...reference.keys()][random(reference.size)]:`never:${i}`;
      assert.equal(model.consume(removed),reference.delete(removed));
    }
    else {
      const candidate={instanceId,catalogId:`catalog:${random(9)}`,sourceEventId:random(4)?`event:${random(50)}`:''};
      const existing=reference.get(instanceId)||[...reference.values()].find(row=>candidate.sourceEventId&&row.sourceEventId===candidate.sourceEventId&&row.catalogId===candidate.catalogId);
      const canonical=existing?.instanceId||instanceId;
      assert.equal(model.upsertItem(candidate),canonical);
      reference.set(canonical,{...candidate,instanceId:canonical});
    }
    for(let j=0;j<9;j++){
      const catalogId=`catalog:${j}`;
      assert.equal(model.item(catalogId)?.instanceId,[...reference.values()].find(row=>row.catalogId===catalogId)?.instanceId);
    }
    if(i%100===0)assert.deepEqual(model.exportState().items.map(({instanceId,catalogId,sourceEventId})=>({instanceId,catalogId,sourceEventId})),[...reference.values()]);
  }
});

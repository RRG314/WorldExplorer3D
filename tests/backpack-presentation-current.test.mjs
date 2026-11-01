import assert from 'node:assert/strict';
import test from 'node:test';
import {parseFragment} from 'parse5';
import {createEquipmentInventory} from '../app/js/urban-sandbox/equipment-model.js';
import {createUrbanEquipmentRuntime} from '../app/js/urban-sandbox/equipment-runtime.js';

function buttons(markup) {
  const result=[];
  function visit(node) {
    if(node.tagName==='button')result.push(node);
    for(const child of node.childNodes||[])visit(child);
  }
  visit(parseFragment(markup));
  return result;
}
const attr=(node,name)=>node.attrs.find(a=>a.name===name)?.value;
function text(node) { return node.nodeName==='#text'?node.value:(node.childNodes||[]).map(text).join(''); }

function withPresentation(run) {
  const previous=globalThis.document;
  globalThis.document={activeElement:null};
  try {
    const equipment=createEquipmentInventory();
    const ui={root:{contains:()=>false,classList:{toggle(){}},setAttribute(){}},toggle:{},slots:{innerHTML:''},detail:{innerHTML:''},status:{textContent:''}};
    const state={equipment,equipmentUi:ui,equipmentOpen:true,mobile:false};
    const runtime=createUrbanEquipmentRuntime({state,isActive:()=>true});
    run({equipment,ui,state,runtime});
  } finally {
    if(previous===undefined)delete globalThis.document;
    else globalThis.document=previous;
  }
}

test('one item assigned to two quick slots renders both actual bindings without changing inventory',()=>{
  withPresentation(({equipment,ui,runtime})=>{
    const item=equipment.summary().hotbar[1];
    equipment.assignHotbar(6,item.instanceId);
    const before=equipment.exportState();
    runtime.render();
    const slots=buttons(ui.slots.innerHTML);
    assert.equal(slots.length,6);
    for(const index of [1,5]) {
      assert.equal(attr(slots[index],'data-equipment-id'),item.instanceId);
      assert.equal(attr(slots[index],'disabled'),undefined);
      assert.match(attr(slots[index],'title'),new RegExp(`^${index+1}\\.`));
      assert.equal(text(slots[index]).trim().startsWith(String(index+1)),true);
    }
    assert.deepEqual(equipment.exportState(),before,'Rendering cannot rewrite saved bindings');
    equipment.equipSlot(6);
    assert.equal(equipment.equipped().catalogId,item.catalogId);
  });
});

test('an empty quick slot does not shift or remove a later binding',()=>{
  withPresentation(({equipment,ui,runtime})=>{
    const item=equipment.summary().hotbar[1];
    equipment.assignHotbar(6,item.instanceId);
    equipment.assignHotbar(2,null);
    runtime.render();
    const slots=buttons(ui.slots.innerHTML);
    assert.equal(slots.length,6);
    assert.notEqual(attr(slots[1],'disabled'),undefined);
    assert.equal(attr(slots[1],'aria-label'),'Quick slot 2 is empty');
    assert.equal(attr(slots[5],'data-equipment-id'),item.instanceId);
    assert.match(attr(slots[5],'title'),/^6\./);
  });
});

test('the grouped assignment controls preserve all six commands and the inspected item identity',()=>{
  withPresentation(({equipment,ui,state,runtime})=>{
    const item=equipment.summary().hotbar[1];
    state.backpackSelectedId=item.instanceId;
    runtime.render();
    const assignments=buttons(ui.detail.innerHTML).filter(b=>attr(b,'data-backpack-slot'));
    assert.deepEqual(assignments.map(b=>attr(b,'data-backpack-slot')),['1','2','3','4','5','6']);
    assert.ok(assignments.every(b=>attr(b,'data-equipment-id')===item.instanceId));
    assert.match(ui.detail.innerHTML,/role="group" aria-label="Assign to quick access"/);
  });
});

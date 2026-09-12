import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryTotals,decisionReport} from '../../app/js/experiments/embodied-society/observer-report.mjs';
test('inventory aggregates stack quantities and individual instances by catalog identity',()=>{
 assert.deepEqual(inventoryTotals([{catalogId:'trail-water',quantity:7},{catalogId:'trail-water',quantity:1},{catalogId:'research:stone'}]),{'trail-water':8,'research:stone':1});
});
test('decision report distinguishes rejected actions, absent summaries and measured consumption',()=>{
 const before={tick:1,inventory:[{catalogId:'route-snack',quantity:8}],needs:{food:.53}};
 const after={tick:1,inventory:[{catalogId:'route-snack',quantity:7}],needs:{food:.83}};
 const text=decisionReport({runId:'run',actorId:'a',status:'ended',actionEvidence:[{decision:1,action:{kind:'consume'},before,after,status:'applied'}, {decision:2,decisionSummary:'Get water',action:{kind:'gather'},before:after,after,status:'rejected',reason:'resource-not-in-reach'}]});
 assert.match(text,/Not recorded for this decision/);assert.match(text,/route snack -1/);assert.match(text,/food 0.830/);assert.match(text,/Stated intent: Get water/);assert.match(text,/rejected \(resource-not-in-reach\)/);assert.match(text,/Inventory change: none/);
});

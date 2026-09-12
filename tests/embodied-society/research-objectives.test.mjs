import test from 'node:test';
import assert from 'node:assert/strict';
import {researchObjective} from '../../app/js/experiments/embodied-society/research-objectives.mjs';

test('general exploration has no additional task and unknown objectives fail closed',()=>{
 assert.equal(researchObjective().text,null);
 assert.throws(()=>researchObjective('unreviewed-objective'),/Unknown research objective/);
});
test('operator task cannot be changed through a shared returned object',()=>{
 const task=researchObjective('tool-use-v1');
 assert.throws(()=>{task.text='Changed';},TypeError);
 assert.equal(researchObjective('tool-use-v1').text,task.text);
});

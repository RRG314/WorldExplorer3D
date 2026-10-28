import test from 'node:test';
import assert from 'node:assert/strict';
import {installLightUniformExperiment} from '../scripts/verification/light-uniform-experiment.mjs';
function fixture(){
 const calls=[];const uniform={setValue(_gl,value){calls.push(value[0].intensity);}};
 const renderer={info:{programs:[{getUniforms:()=>({map:{pointLights:uniform}})}]},render(scene){scene.draw();}};
 const control=installLightUniformExperiment({renderer});return {renderer,uniform,calls,control};
}
test('same program light state uploads once per render, and refreshes for changed frames',()=>{
 const f=fixture(),light=[{intensity:1}],scene={draw(){for(let i=0;i<10;i++)f.uniform.setValue(null,light);}};
 f.renderer.render(scene,{});light[0].intensity=5;f.renderer.render(scene,{});
 assert.deepEqual(f.calls,[1,5]);assert.equal(f.control.snapshot().skipped,18);
});
test('different light-state owners within a render cannot share a cached upload',()=>{
 const f=fixture(),a=[{intensity:1}],b=[{intensity:2}];
 f.renderer.render({draw(){for(const value of [a,b,a,a])f.uniform.setValue(null,value);}},{ });
 assert.deepEqual(f.calls,[1,2,1]);
});
test('nested views invalidate the parent program before rendering resumes',()=>{
 const f=fixture(),a=[{intensity:1}],b=[{intensity:2}];
 f.renderer.render({draw(){f.uniform.setValue(null,a);f.renderer.render({draw(){f.uniform.setValue(null,b);}},{});f.uniform.setValue(null,a);}},{ });
 assert.deepEqual(f.calls,[1,2,1]);
});
test('array cameras and direct uniform calls retain the renderer behavior',()=>{
 const f=fixture(),a=[{intensity:1}];
 f.renderer.render({draw(){f.uniform.setValue(null,a);a[0].intensity=2;f.uniform.setValue(null,a);}},{isArrayCamera:true});
 a[0].intensity=3;f.uniform.setValue(null,a);assert.deepEqual(f.calls,[1,2,3]);
});
test('failed render and disabling the guard cannot leave reuse active',()=>{
 const f=fixture(),a=[{intensity:1}];
 assert.throws(()=>f.renderer.render({draw(){f.uniform.setValue(null,a);throw Error('draw failed');}},{}));
 a[0].intensity=2;f.uniform.setValue(null,a);f.control.setEnabled(false);
 f.renderer.render({draw(){f.uniform.setValue(null,a);a[0].intensity=3;f.uniform.setValue(null,a);}},{ });
 assert.deepEqual(f.calls,[1,2,2,3]);
});

test('installation is idempotent and renderer disposal restores owned hooks',()=>{
 const calls=[],uniform={setValue(){calls.push('uniform');}},set=uniform.setValue;
 const render=()=>{},dispose=()=>calls.push('dispose');
 const renderer={info:{programs:[{getUniforms:()=>({map:{pointLights:uniform}})}]},render,dispose};
 const control=installLightUniformExperiment({renderer});
 assert.equal(installLightUniformExperiment({renderer}),control);renderer.render({},{});
 assert.notEqual(uniform.setValue,set);renderer.dispose();
 assert.equal(renderer.render,render);assert.equal(renderer.dispose,dispose);assert.equal(uniform.setValue,set);
 assert.deepEqual(calls,['dispose']);control.dispose();
});

test('single numeric caches retain exact doubles across enable/disable and disposal without changing dynamic arrays',()=>{
 const values=[1/3,-0,1+Number.EPSILON],uniform={cache:[],setValue(_gl,value){for(let i=0;i<value.length;i++)this.cache[i]=value[i];}};
 const array={cache:[],size:3,setValue:uniform.setValue},original=uniform.cache;
 const renderer={info:{programs:[{getUniforms:()=>({map:{diffuse:uniform,weights:array}})}]},render(){uniform.setValue(null,values);array.setValue(null,values);}};
 const control=installLightUniformExperiment({renderer});renderer.render({},{});
 assert.ok(uniform.cache instanceof Float64Array);assert.deepEqual([...uniform.cache],values);assert.ok(Array.isArray(array.cache));
 const buffer=uniform.cache;renderer.render({},{});assert.equal(uniform.cache,buffer);
 control.setEnabled(false);assert.equal(uniform.cache,original);renderer.render({},{});assert.deepEqual(uniform.cache,values);
 control.setEnabled(true);assert.equal(uniform.cache,buffer);control.dispose();assert.equal(uniform.cache,original);assert.deepEqual(uniform.cache,values);
});

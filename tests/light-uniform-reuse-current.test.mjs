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

test('fixed float uniforms retain exact comparisons and restore original setters without changing pure arrays',()=>{
 const values=[1/3,-0,1+Number.EPSILON],uploads=[],gl={ACTIVE_UNIFORMS:35718,getProgramParameter:()=>2,
 getActiveUniform:(_program,i)=>({name:i?'weights':'diffuse',type:35665}),uniform3f(_location,x,y,z){uploads.push([x,y,z]);}};
 const originalSetter=function(_gl,value){for(let i=0;i<value.length;i++)this.cache[i]=value[i];uploads.push([...value]);};
 const uniform={cache:[],setValue:originalSetter},array={cache:[],size:3,setValue(){}};
 const renderer={getContext:()=>gl,info:{programs:[{program:{},getUniforms:()=>({map:{diffuse:uniform,weights:array}})}]},render(){uniform.setValue(gl,values);}};
 const control=installLightUniformExperiment({renderer});renderer.render({},{});renderer.render({},{});
 assert.deepEqual(uploads,[values]);assert.equal(control.snapshot().numericConverted,1);assert.equal(array.setValue.name,'setValue');
 control.setEnabled(false);assert.deepEqual(uniform.cache,values);renderer.render({},{});assert.equal(uploads.length,2);
 control.setEnabled(true);renderer.render({},{});assert.equal(uploads.length,3);control.dispose();assert.equal(uniform.setValue,originalSetter);assert.deepEqual(uniform.cache,values);
});

test('matrix uploads reuse their Float32 storage while preserving exact cache precision across views',()=>{
 const uploads=[],gl={ACTIVE_UNIFORMS:35718,getProgramParameter:()=>1,getActiveUniform:()=>({name:'modelViewMatrix',type:35676}),uniformMatrix4fv(_addr,transpose,data){uploads.push({transpose,data,values:[...data]});}};
 const originalSetter=function(_gl,value){this.cache=[...value.elements];},uniform={cache:[],setValue:originalSetter};let matrix={elements:Array.from({length:16},(_,i)=>i/7)};
 const renderer={getContext:()=>gl,info:{programs:[{program:{},getUniforms:()=>({map:{modelViewMatrix:uniform}})}]},render(){uniform.setValue(gl,matrix);}};
 const control=installLightUniformExperiment({renderer});renderer.render({},{});renderer.render({},{});assert.equal(uploads.length,1);
 matrix.elements[12]=1234.123456789;renderer.render({},{});assert.equal(uploads.length,2);assert.equal(uploads[0].data,uploads[1].data);assert.deepEqual(uploads[1].values,[...Float32Array.from(matrix.elements)]);assert.equal(uploads[1].transpose,false);
 control.dispose();assert.equal(uniform.setValue,originalSetter);assert.deepEqual(uniform.cache,matrix.elements);
});

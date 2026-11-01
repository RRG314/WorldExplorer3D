// Three r128 revisits programs during opaque depth sorting. Each WebGL
// program already retains its numeric light uniforms across those switches.
// Restrict reuse to one renderer.render view and the same light-state object.
// Texture/sampler uniforms are excluded because texture-unit bindings differ.
export function installRenderLightUniformReuse(ctx) {
  const renderer=ctx.renderer,marker=Symbol.for('WorldExplorer.renderLightUniformReuse');
  if(renderer[marker])return renderer[marker];
  const original=renderer.render,originalDraw=renderer.renderBufferDirect,originalDispose=renderer.dispose,seen=new WeakSet(),setters=new WeakMap(),used=[];
  const names=['directionalLights','pointLights','spotLights','hemisphereLights','rectAreaLights'];
  let epoch=0,enabled=true,allowed=false,calls=0,skipped=0,wrapped=0,numericConverted=0;
  const numericStates=new WeakMap();
  function leaves(uniforms,visit){
    for(const uniform of uniforms.seq||Object.values(uniforms.map||{})){
      if(uniform.seq)leaves(uniform,visit);else visit(uniform);
    }
  }
  // Reflect the pinned renderer's actual GL types. Only fixed float uniforms
  // use this path; samplers, integer uniforms and pure arrays retain r128.
  // Specialized setters keep the cache and upload buffers typed throughout,
  // rather than passing mixed generic/typed arrays through r128's shared copy.
  function numericCache(program,uniforms){
    const gl=renderer.getContext?.();if(!gl||!program.program)return;
    const widths={5126:1,35664:2,35665:3,35666:4,35674:4,35675:9,35676:16};
    const count=gl.getProgramParameter(program.program,gl.ACTIVE_UNIFORMS);
    for(let index=0;index<count;index++){
      const info=gl.getActiveUniform(program.program,index),width=widths[info.type];if(!width)continue;
      let uniform=uniforms;
      for(const part of info.name.replace(/\[(\d+)\]/g,'.$1').split('.'))uniform=uniform?.map?.[part];
      if(!uniform||uniform.size!==undefined||!Array.isArray(uniform.cache)||numericStates.has(uniform))continue;
      const originalSetter=uniform.setValue,cache=new Float64Array(width).fill(NaN);
      const upload=info.type>=35674?new Float32Array(width):null;
      const state={originalSetter,cache,valid:false,setter:null};
      const setter=function(context,value,textures){
        if(!enabled)return originalSetter.call(this,context,value,textures);
        if(upload){
          const values=value.elements===undefined?value:value.elements;
          if(values.length!==width)return originalSetter.call(this,context,value,textures);
          let changed=false;
          for(let i=0;i<width;i++)if(cache[i]!==values[i]){changed=true;break;}
          if(!changed&&state.valid)return;
          for(let i=0;i<width;i++)upload[i]=cache[i]=values[i];
          if(width===16)context.uniformMatrix4fv(this.addr,false,upload);
          else if(width===9)context.uniformMatrix3fv(this.addr,false,upload);
          else context.uniformMatrix2fv(this.addr,false,upload);
        }else{
          const vector=width>1&&value.x!==undefined,color=width===3&&!vector&&value.r!==undefined;
          if(width>1&&!vector&&!color&&value.length!==width)return originalSetter.call(this,context,value,textures);
          const x=width===1?value:vector?value.x:color?value.r:value[0];
          const y=width>1?(vector?value.y:color?value.g:value[1]):0;
          const z=width>2?(vector?value.z:color?value.b:value[2]):0;
          const w=width>3?(vector?value.w:value[3]):0;
          if(state.valid&&cache[0]===x&&(width<2||cache[1]===y)&&(width<3||cache[2]===z)&&(width<4||cache[3]===w))return;
          cache[0]=x;if(width>1)cache[1]=y;if(width>2)cache[2]=z;if(width>3)cache[3]=w;
          if(width===1)context.uniform1f(this.addr,x);
          else if(width===2)context.uniform2f(this.addr,x,y);
          else if(width===3)context.uniform3f(this.addr,x,y,z);
          else context.uniform4f(this.addr,x,y,z,w);
        }
        state.valid=true;
      };
      state.setter=setter;numericStates.set(uniform,state);uniform.setValue=setter;numericConverted++;
    }
  }
  function toggleNumeric(uniform,active,dispose=false){
    const state=numericStates.get(uniform);if(!state||uniform.setValue!==state.setter)return;
    if(!active&&state.valid)for(let i=0;i<state.cache.length;i++)uniform.cache[i]=state.cache[i];
    if(active){state.valid=false;state.cache.fill(NaN);}
    if(dispose)uniform.setValue=state.originalSetter;
  }
  // Object3D's model-view and normal matrices are renderer scratch, distinct
  // from actor/world transforms. Retain their exact doubles in fixed buffers.
  // Frame lists contain WeakRefs so a hidden/loading renderer cannot retain a
  // retired city's parent graph. Offscreen/disposed views restore owned arrays.
  const scratchStates=new WeakMap();let previousScratch=[],currentScratch=[],renderDepth=0,scratchEpoch=0,scratchConverted=0;
  function restoreScratch(state){
    for(const entry of state.entries)if(entry.matrix.elements===entry.typed){
      for(let i=0;i<entry.typed.length;i++)entry.original[i]=entry.typed[i];entry.matrix.elements=entry.original;
    }
  }
  function scratch(object){
    if(!enabled||!object||typeof WeakRef!=='function')return;
    let state=scratchStates.get(object);
    if(!state){
      const entries=[];
      for(const key of ['modelViewMatrix','normalMatrix']){
        const matrix=object[key],original=matrix?.elements;
        if(Array.isArray(original))entries.push({matrix,original,typed:Float64Array.from(original)});
      }
      if(!entries.length)return;
      state={entries,ref:new WeakRef(object),epoch:-1};scratchStates.set(object,state);scratchConverted++;
    }
    for(const entry of state.entries)if(entry.matrix.elements===entry.original){entry.typed.set(entry.original);entry.matrix.elements=entry.typed;}
    if(state.epoch!==scratchEpoch){state.epoch=scratchEpoch;currentScratch.push(state.ref);}
  }
  const draw=function(camera,scene,geometry,material,object,group){
    if(renderDepth>0)scratch(object);return originalDraw.call(this,camera,scene,geometry,material,object,group);
  };
  if(typeof originalDraw==='function')renderer.renderBufferDirect=draw;
  function clearScratch(){
    for(const refs of [previousScratch,currentScratch])for(const ref of refs){const object=ref.deref(),state=object&&scratchStates.get(object);if(state)restoreScratch(state);}
  }
  function prepare(){
    for(const program of renderer.info.programs){
      if(seen.has(program))continue;seen.add(program);
      const programUniforms=program.getUniforms();
      numericCache(program,programUniforms);
      const uniforms=programUniforms.map;
      for(const name of names){
        const uniform=uniforms[name];if(!uniform)continue;
        const set=uniform.setValue,state={epoch:-1,value:null};wrapped++;
        const wrappedSetter=function(gl,value,textures){
          calls++;
          if(enabled&&allowed){
            if(state.epoch===epoch&&state.value===value){skipped++;return;}
            if(state.epoch!==epoch)used.push(state);
            state.epoch=epoch;state.value=value;
          }
          return set.call(this,gl,value,textures);
        };
        uniform.setValue=wrappedSetter;setters.set(uniform,{original:set,wrapped:wrappedSetter});
      }
    }
  }
  const render=function(scene,camera){
    const priorAllowed=allowed,outer=renderDepth++===0;
    if(outer){scratchEpoch++;currentScratch.length=0;}
    // ArrayCamera renders several views within one render invocation.
    allowed=!camera?.isArrayCamera;epoch++;
    try{prepare();return original.call(this,scene,camera);}
    finally{
      epoch++;allowed=priorAllowed;renderDepth--;
      if(outer){
        for(const ref of previousScratch){const object=ref.deref(),state=object&&scratchStates.get(object);if(state&&state.epoch!==scratchEpoch)restoreScratch(state);}
        const recycled=previousScratch;previousScratch=currentScratch;currentScratch=recycled;currentScratch.length=0;
      }
      for(const state of used)state.value=null;
      used.length=0;
    }
  };
  renderer.render=render;
  let disposed=false;
  const control={
    setEnabled(value){if(!disposed){enabled=!!value;epoch++;if(!enabled)clearScratch();for(const program of renderer.info.programs)leaves(program.getUniforms(),uniform=>toggleNumeric(uniform,enabled));}},
    snapshot(){return {calls,skipped,wrapped,numericConverted,scratchConverted};},
    dispose(){
      if(disposed)return;disposed=true;enabled=false;allowed=false;epoch++;
      clearScratch();previousScratch.length=currentScratch.length=0;
      if(renderer.renderBufferDirect===draw)renderer.renderBufferDirect=originalDraw;
      for(const state of used)state.value=null;used.length=0;
      for(const program of renderer.info.programs){
        if(!seen.has(program))continue;
        const programUniforms=program.getUniforms();
        leaves(programUniforms,uniform=>toggleNumeric(uniform,false,true));
        const uniforms=programUniforms.map;
        for(const name of names){
          const uniform=uniforms[name],entry=uniform&&setters.get(uniform);
          if(entry&&uniform.setValue===entry.wrapped)uniform.setValue=entry.original;
        }
      }
      if(renderer.render===render)renderer.render=original;
      if(renderer.dispose===disposeRenderer)renderer.dispose=originalDispose;
      delete renderer[marker];
    }
  };
  function disposeRenderer(){control.dispose();return originalDispose.call(this);}
  if(typeof originalDispose==='function')renderer.dispose=disposeRenderer;
  renderer[marker]=control;
  return control;
}

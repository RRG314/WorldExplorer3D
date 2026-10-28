// Three r128 revisits programs during opaque depth sorting. Each WebGL
// program already retains its numeric light uniforms across those switches.
// Restrict reuse to one renderer.render view and the same light-state object.
// Texture/sampler uniforms are excluded because texture-unit bindings differ.
export function installRenderLightUniformReuse(ctx) {
  const renderer=ctx.renderer,marker=Symbol.for('WorldExplorer.renderLightUniformReuse');
  if(renderer[marker])return renderer[marker];
  const original=renderer.render,originalDispose=renderer.dispose,seen=new WeakSet(),setters=new WeakMap(),used=[];
  const names=['directionalLights','pointLights','spotLights','hemisphereLights','rectAreaLights'];
  let epoch=0,enabled=true,allowed=false,calls=0,skipped=0,wrapped=0,numericConverted=0;
  const numericStates=new WeakMap();
  function leaves(uniforms,visit){
    for(const uniform of uniforms.seq||Object.values(uniforms.map||{})){
      if(uniform.seq)leaves(uniform,visit);else visit(uniform);
    }
  }
  // r128 SingleUniform caches use generic JS arrays. Repeated floating-point
  // writes can box numbers during rendering. A fixed Float64 buffer preserves
  // the cache's exact JS-number comparisons without those temporary objects.
  // PureArrayUniform has a dynamic size/cache contract and is left untouched.
  function numericCache(uniform){
    if(uniform.size!==undefined||!Array.isArray(uniform.cache)||typeof uniform.setValue!=='function')return;
    const state={original:uniform.cache,typed:null,setter:uniform.setValue,lazy:null};
    numericStates.set(uniform,state);
    const convert=()=>{
      const values=uniform.cache;
      if(!enabled||!Array.isArray(values)||!values.length||values.length>16||!values.every(value=>typeof value==='number'))return;
      state.original=values;state.typed=Float64Array.from(values);uniform.cache=state.typed;numericConverted++;
      if(uniform.setValue===state.lazy)uniform.setValue=state.setter;
    };
    convert();
    if(!state.typed){
      state.lazy=function(...args){const result=state.setter.apply(this,args);convert();return result;};
      uniform.setValue=state.lazy;
    }
  }
  function toggleNumeric(uniform,active,dispose=false){
    const state=numericStates.get(uniform);if(!state)return;
    if(state.typed){
      if(!active&&uniform.cache===state.typed){for(let i=0;i<state.typed.length;i++)state.original[i]=state.typed[i];uniform.cache=state.original;}
      else if(active&&uniform.cache===state.original){state.typed.set(state.original);uniform.cache=state.typed;}
    }
    if(dispose&&uniform.setValue===state.lazy)uniform.setValue=state.setter;
  }
  function prepare(){
    for(const program of renderer.info.programs){
      if(seen.has(program))continue;seen.add(program);
      const programUniforms=program.getUniforms();
      leaves(programUniforms,numericCache);
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
    const priorAllowed=allowed;
    // ArrayCamera renders several views within one render invocation.
    allowed=!camera?.isArrayCamera;epoch++;prepare();
    try{return original.call(this,scene,camera);}
    finally{
      epoch++;allowed=priorAllowed;
      for(const state of used)state.value=null;
      used.length=0;
    }
  };
  renderer.render=render;
  let disposed=false;
  const control={
    setEnabled(value){if(!disposed){enabled=!!value;epoch++;for(const program of renderer.info.programs)leaves(program.getUniforms(),uniform=>toggleNumeric(uniform,enabled));}},
    snapshot(){return {calls,skipped,wrapped,numericConverted};},
    dispose(){
      if(disposed)return;disposed=true;enabled=false;allowed=false;epoch++;
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

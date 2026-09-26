// Opt-in diagnostics for real renderer stalls. Measure WebGL boundaries to
// distinguish shader/texture/buffer work from JavaScript traversal. Retain
// only a bounded summary; never retain upload data or image objects.
export function createGraphicsCallEvidence(gl, {now=()=>performance.now(), thresholdMs=100}={}) {
  const originals=new Map(),history=[];
  let active=null;
  for(const name of ['bufferData','bufferSubData','texImage2D','texSubImage2D','generateMipmap','compileShader','linkProgram','getProgramParameter','getShaderParameter','drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','finish']) {
    if(typeof gl?.[name]!=='function')continue;
    const original=gl[name];
    const wrapper=function(...args){
      if(!active)return original.apply(this,args);
      const started=now();
      try{return original.apply(this,args);}
      finally{
        const durationMs=now()-started;
        const entry=active.calls[name] || (active.calls[name]={count:0,totalMs:0,maxMs:0});
        entry.count++;entry.totalMs+=durationMs;entry.maxMs=Math.max(entry.maxMs,durationMs);
      }
    };
    gl[name]=wrapper;originals.set(name,{original,wrapper});
  }
  return {
    begin(){active={started:now(),calls:{}};},
    end(){
      if(!active)return null;
      const record=active;active=null;
      const durationMs=now()-record.started;
      if(durationMs<thresholdMs)return null;
      const calls=Object.fromEntries(Object.entries(record.calls).map(([name,value])=>[name,{count:value.count,totalMs:Math.round(value.totalMs*10)/10,maxMs:Math.round(value.maxMs*10)/10}]));
      const sample={durationMs:Math.round(durationMs*10)/10,calls};
      history.push(sample);if(history.length>12)history.shift();
      return sample;
    },
    snapshot(){return history.slice();},
    dispose(){active=null;for(const [name,{original,wrapper}] of originals)if(gl[name]===wrapper)gl[name]=original;originals.clear();history.length=0;}
  };
}

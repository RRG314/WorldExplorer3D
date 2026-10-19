// A rendered batch and its contact index have one lifetime. Publications hold
// leases so an atomic handover can retain unchanged streets without copying or
// disposing the accepted geometry. No retired publication is retained here.
export function createPavementBatch({key,signature,surfaceOwner,mesh,contactIndex=null}) {
  const state={key,signature,surfaceOwner,mesh,contactIndex,references:0};
  return lease(state);
}

function lease(state) {
  state.references++;
  let released=false;
  return {
    key:state.key,
    get mesh(){return released?null:state.mesh;},
    get contactIndex(){return released?null:state.contactIndex;},
    retain(signature,surfaceOwner,material){
      if(released||!signature||signature!==state.signature||surfaceOwner!==state.surfaceOwner||material!==state.mesh.material)return null;
      return lease(state);
    },
    release(){
      if(released)return;released=true;
      if(--state.references)return;
      state.contactIndex?.dispose();state.contactIndex=null;
      state.mesh.parent?.remove(state.mesh);state.mesh.geometry.dispose();
      state.mesh=null;state.surfaceOwner=null;
    }
  };
}

// Query neighboring batches too: exact boundary triangles retain the original
// contact tolerance after Float32 upload. Never choose a lower surface merely
// because it belongs to a different batch at a shared edge.
export function createPavementBatchContacts(batches,mappedIndex) {
  const columns=new Map();
  for(const batch of batches.values()){
    if(!batch.contactIndex)continue;
    const [x,z]=batch.key.split(':').map(Number);
    if(!columns.has(x))columns.set(x,new Map());
    columns.get(x).set(z,batch.contactIndex);
  }
  return {
    sampleAt(x,z){
      let best=mappedIndex?.sampleAt(x,z)??null;
      const ix=Math.floor(x/128),iz=Math.floor(z/128);
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
        const y=columns.get(ix+dx)?.get(iz+dz)?.sampleAt(x,z);
        if(Number.isFinite(y)&&(best===null||y>best))best=y;
      }
      return best;
    },
    dispose(){columns.clear();mappedIndex?.dispose();mappedIndex=null;}
  };
}

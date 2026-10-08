// Synchronous, caller-owned candidate storage. A generation stamp avoids
// allocating a new Set backing table for each swept contact. Weak keys do not
// retain a previous world's colliders. Returned collision records never use
// these slots, and the query releases every strong reference in finally.
export function createCollisionCandidates() {
  return {items:[],count:0,seen:new WeakMap(),generation:1};
}

export function hasCollisionCandidate(buffer,candidate) {
  if(candidate && (typeof candidate==='object'||typeof candidate==='function')) {
    return buffer.seen.get(candidate)===buffer.generation;
  }
  for(let i=0;i<buffer.count;i++)if(buffer.items[i]===candidate)return true;
  return false;
}

export function appendCollisionCandidate(buffer,candidate) {
  if(!candidate||hasCollisionCandidate(buffer,candidate))return;
  if(typeof candidate==='object'||typeof candidate==='function')buffer.seen.set(candidate,buffer.generation);
  buffer.items[buffer.count++]=candidate;
}

export function releaseCollisionCandidates(buffer) {
  for(let i=0;i<buffer.count;i++)buffer.items[i]=null;
  buffer.count=0;
  if(buffer.generation===Number.MAX_SAFE_INTEGER){buffer.generation=1;buffer.seen=new WeakMap();}
  else buffer.generation++;
}

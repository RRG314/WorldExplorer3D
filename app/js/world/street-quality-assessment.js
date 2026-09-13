// Readiness budgets for the 8 GiB reference machine. These are engineering
// acceptance limits, not a measurement of total browser/GPU memory.
export const STREET_QUALITY_BUDGETS = Object.freeze({javascriptHeapBytes:768*1024*1024,pavementPositionBytes:16*1024*1024,refinementMultiplier:8});
export function assessStreetQuality(snapshot){
 const failures=[],pending=[];const s=snapshot.street||{},b=STREET_QUALITY_BUDGETS;
 if(snapshot.worldLoading||snapshot.pavementBuildActive)pending.push('world or pavement publication still running');
 if(!Number.isFinite(snapshot.javascriptHeapBytes))pending.push('JavaScript heap unavailable');
 else if(snapshot.javascriptHeapBytes>b.javascriptHeapBytes)failures.push('JavaScript heap exceeds 768 MiB');
 const first=snapshot.deferredWork?.firstPlayDetail?.loadDurationMs,target=snapshot.deferredWork?.budgets?.firstPlayTargetMs||25000;
 if(!Number.isFinite(first))pending.push('first-play duration unavailable');else if(first>target)failures.push(`first play exceeds ${target} ms`);
 if(!Number.isFinite(s.triangles))pending.push('pavement statistics unavailable');
 const original=s.triangles-(s.terrainRefinementTriangles||0),multiplier=original>0?s.triangles/original:null;
 if(multiplier>b.refinementMultiplier)failures.push('terrain refinement multiplies pavement triangles by more than 8');
 if(s.positionBytes>b.pavementPositionBytes)failures.push('resident pavement positions exceed 16 MiB');
 if(!s.sourceCoverage || s.sourceCoverage.status==='unknown')pending.push('loaded street-network coverage has not been established');
 else if(s.sourceCoverage.status==='incomplete')failures.push('loaded streets requiring sidewalks extend beyond the compiled pavement window');
 return {status:failures.length?'fail':pending.length?'pending':'performance checks pass',failures,pending,refinementMultiplier:multiplier,budgets:b,visualStatus:'Requires camera sweep and recorded city route; performance checks cannot certify appearance.'};
}

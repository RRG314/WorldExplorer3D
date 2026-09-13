// Readiness budgets for the 8 GiB reference machine. These are engineering
// acceptance limits, not a measurement of total browser/GPU memory.
export const STREET_QUALITY_BUDGETS = Object.freeze({javascriptHeapBytes:768*1024*1024,pavementPositionBytes:16*1024*1024,refinementMultiplier:8});
export function assessStreetQuality(snapshot){
 const failures=[],pending=[];const s=snapshot.street||{},b=STREET_QUALITY_BUDGETS;
 const overview=snapshot.streetOverview;
 const overviewComplete=overview?.status==='complete'&&Number.isInteger(overview.totalCells)&&overview.completedCells===overview.totalCells&&overview.workerActive===false&&!overview.error;
 if(snapshot.roadTerrainConformance?.issuesFound>0)failures.push('at-grade road surfaces separate from rendered terrain; inspect floating/buried samples');
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
 else if(s.sourceCoverage.status==='incomplete' && !overviewComplete)failures.push('loaded streets requiring sidewalks extend beyond completed pavement coverage');
 if(overview && !overviewComplete)pending.push('location-wide pavement areas are not complete');
 if(overview?.status==='complete'&&!overviewComplete)failures.push('location pavement completion counters or worker state are inconsistent');
 if(snapshot.streetOverview?.status==='failed')failures.push(snapshot.streetOverview.error || 'location-wide pavement failed');
 return {status:failures.length?'fail':pending.length?'pending':'performance checks pass',failures,pending,refinementMultiplier:multiplier,budgets:b,visualStatus:'Requires camera sweep and recorded city route; performance checks cannot certify appearance.'};
}

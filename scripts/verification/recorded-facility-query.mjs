// The backend-room recordings predate perimeter detail. Reuse their unchanged
// streets for backend isolation and explicitly supply empty ancillary boundary
// data for the two new clauses. This is controlled fixture data, not a claim
// that these requests were recorded or that live facilities have no fences.
// The facility suite separately supplies gates/fences and exercises collision.
export function recordedFacilityReplayQuery(query) {
 if(query.includes('nwr["barrier"~'))return query;
 const marker=/(nwr\["aeroway"~"[^"\n]+"\](\([^\n;]+\));)/;
 if(!marker.test(query))throw Error('Recorded query has no reviewed facility scope');
 return query.replace(marker,(_whole,line,bounds)=>`${line}\n                nwr["barrier"~"^(fence|gate|lift_gate|swing_gate|sliding_gate|kissing_gate|entrance)$"]${bounds};\n                way["highway"~"^(service|footway|path)$"]${bounds};`);
}

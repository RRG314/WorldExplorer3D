// Generalized vector tiles omit many interior OSM nodes. The unioned ground
// carriageway still has one physical height at these planar intersections.
// Reconcile its grade without inventing navigation connections or modifying
// lossless source topology, bridges, tunnels or engineered highway approaches.
export function assignSurfaceStreetJunctions(features, sampleTerrain) {
  const cells=new Map(),wide=[],all=[],size=128;
  let intersections=0;
  const eligible=f=>f?.transportRecord?.completeness==='generalized' &&
    f.transportRecord.routeState!=='incomplete' && f.driveable!==false &&
    f.structureSemantics?.terrainMode==='at_grade' && !f.structureSemantics.gradeSeparated &&
    !f.structureSemantics.topologySeparated && !f.structureSemantics.physicalStructureEvidence &&
    !f.structureSemantics.rampCandidate && !f.transportSurfaceModel?.engineeredApproach &&
    !/^(motorway|trunk)(?:_link)?$|_link$/.test(f.type||'');
  const add=(feature,distance,targetSurfaceY)=>{
    const anchors=feature.ordinaryStreetAnchors ||= [];
    const prior=anchors.find(a=>Math.abs(a.distance-distance)<1e-5);
    if(prior)prior.targetSurfaceY=Math.max(prior.targetSurfaceY,targetSurfaceY);
    else anchors.push({distance,targetSurfaceY,source:'generalized-surface-intersection'});
  };
  for(const feature of features){
    if(!eligible(feature))continue;
    let distance=0;
    for(let i=1;i<(feature.pts?.length||0);i++){
      const a=feature.pts[i-1],b=feature.pts[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
      if(![a.x,a.z,b.x,b.z,length].every(Number.isFinite)||length<1e-6)continue;
      const segment={feature,a,b,dx,dz,length,distance};distance+=length;
      const x0=Math.floor(Math.min(a.x,b.x)/size),x1=Math.floor(Math.max(a.x,b.x)/size);
      const z0=Math.floor(Math.min(a.z,b.z)/size),z1=Math.floor(Math.max(a.z,b.z)/size);
      const large=(x1-x0+1)*(z1-z0+1)>256;
      const candidates=large?all:new Set(wide);
      if(!large)for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)for(const other of cells.get(`${x}:${z}`)||[])candidates.add(other);
      for(const other of candidates){
        if(other.feature===feature || (Number(feature.structureSemantics.verticalOrder)||0)!==(Number(other.feature.structureSemantics.verticalOrder)||0))continue;
        const determinant=dx*other.dz-dz*other.dx;
        if(Math.abs(determinant)<1e-8*length*other.length)continue;
        const ox=other.a.x-a.x,oz=other.a.z-a.z;
        const t=(ox*other.dz-oz*other.dx)/determinant,u=(ox*dz-oz*dx)/determinant;
        // Endpoint ties already belong to the transport graph. This fills
        // only crossings missing from simplified interiors.
        if(t<=1e-7||t>=1-1e-7||u<=1e-7||u>=1-1e-7)continue;
        const terrain=sampleTerrain(a.x+dx*t,a.z+dz*t);
        if(!Number.isFinite(terrain))continue;
        const target=terrain+Math.max(Number(feature.surfaceBias)||.08,Number(other.feature.surfaceBias)||.08);
        add(feature,segment.distance+t*length,target);
        add(other.feature,other.distance+u*other.length,target);
        intersections++;
      }
      all.push(segment);
      if(large)wide.push(segment);
      else for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
        const key=`${x}:${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);
      }
    }
  }
  return intersections;
}

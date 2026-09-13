// Near detail and distant areas use one accepted ground/road-edge contract.
// The memoized samples live only for one cell publication.
export function createPavementBaseSampler({segments=[],ground,roadContactIndex}) {
  const prepared=segments.map(segment=>{
    const clearance=p=>{
      const base=ground(p.x,p.z),height=roadContactIndex?.sampleAt(p.x,p.z,base,'at_grade');
      const bias=Number.isFinite(segment.road?.surfaceBias)?segment.road.surfaceBias:.18;
      return Math.max(bias,Number.isFinite(height)&&Number.isFinite(base)?height-base:bias);
    };
    return {...segment,clearanceA:clearance(segment.a),clearanceB:clearance(segment.b)};
  });
  const heights=new Map();
  return (x,z)=>{
    const key=`${x}:${z}`;
    if(heights.has(key))return heights.get(key);
    const terrain=ground(x,z);
    if(!Number.isFinite(terrain))throw new Error('Pavement has no accepted terrain height');
    let nearest=null;
    for(const s of prepared){
      const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,lengthSq=dx*dx+dz*dz;
      if(!(lengthSq>0))continue;
      const t=Math.max(0,Math.min(1,((x-s.a.x)*dx+(z-s.a.z)*dz)/lengthSq));
      const px=s.a.x+dx*t,pz=s.a.z+dz*t,distance=Math.hypot(x-px,z-pz);
      if(!nearest||distance<nearest.distance)nearest={s,t,px,pz,distance};
    }
    let height=terrain+.018;
    if(nearest){
      const {s,t,px,pz,distance}=nearest,halfWidth=(s.wa+(s.wb-s.wa)*t)/2;
      const blend=Math.max(0,1-Math.max(0,distance-halfWidth)/8);
      const factor=distance>0?Math.min(1,halfWidth/distance):0;
      const edgeX=px+(x-px)*factor,edgeZ=pz+(z-pz)*factor;
      const edgeGround=ground(edgeX,edgeZ),roadY=roadContactIndex?.sampleAt(edgeX,edgeZ,edgeGround,'at_grade');
      const clearance=Number.isFinite(roadY)&&Number.isFinite(edgeGround)?roadY-edgeGround:s.clearanceA+(s.clearanceB-s.clearanceA)*t;
      height=terrain+Math.max(.018,clearance)*blend;
    }
    if(!Number.isFinite(height))throw new Error('Pavement has no accepted surface height');
    heights.set(key,height);return height;
  };
}

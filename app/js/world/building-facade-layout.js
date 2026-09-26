// Per-wall architecture, computed before world transforms and preserved by batching.
// The footprint and collision mesh are never changed by facade decoration.
export function facadeFloorPlan(height, options = {}) {
  const foundation = Math.max(0, Number(options.foundation) || 0);
  const available = Math.max(0, height - foundation - 0.3); // solid roof/cornice band
  const target = Math.max(2.4, Number(options.window?.floorHeight) || 3.2);
  const requested = Number(options.levels);
  const floors = available < 2 ? 0 : Math.max(1, Math.min(
    Math.floor(available / 2),
    Number.isFinite(requested) && requested > 0 ? Math.round(requested) : Math.round(available / target)
  ));
  return { foundation, floors, floorHeight: floors ? available / floors : target, available };
}

export function attachBuildingFacadeLayout(geometry, options = {}) {
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  if (!p || !n) return null;
  // Extruded walls have split face vertices. Indexed input must also have hard
  // corners; shared smooth wall vertices cannot represent independent wall bays.
  const layout = new Float32Array(p.count * 4);
  const openings = new Float32Array(p.count * 4);
  let minimumY = Infinity, maximumY = -Infinity;
  for (let i=0;i<p.count;i++) { minimumY=Math.min(minimumY,p.getY(i)); maximumY=Math.max(maximumY,p.getY(i)); }
  const plan = facadeFloorPlan(maximumY-minimumY, options);
  const style=options.window || {};
  const glass=options.material?.surfacePattern==='glass';
  const targetBay=glass ? 2.35 : Math.max(1.8,Number(style.bayWidth)||3.4);
  const glazing=glass ? -1 : Math.max(0,Number(options.storefront?.glazing)||0);
  const count=geometry.index?.count ?? p.count;
  for(let offset=0;offset<count;offset+=3) {
    const ids=[0,1,2].map(k=>geometry.index ? geometry.index.getX(offset+k) : offset+k);
    if(ids.some(i=>Math.abs(n.getY(i))>0.2)) continue;
    // Each side triangle spans the two endpoints of its extrusion wall. Derive
    // that exact segment, rather than dominant-axis or whole-building UVs.
    let a=ids[0],b=ids[1],squared=-1;
    for(let j=0;j<3;j++)for(let k=j+1;k<3;k++){
      const d=(p.getX(ids[j])-p.getX(ids[k]))**2+(p.getZ(ids[j])-p.getZ(ids[k]))**2;
      if(d>squared){squared=d;a=ids[j];b=ids[k];}
    }
    if(squared<1e-10)continue;
    if(p.getX(a)>p.getX(b) || (p.getX(a)===p.getX(b)&&p.getZ(a)>p.getZ(b)))[a,b]=[b,a];
    const width=Math.sqrt(squared), dx=(p.getX(b)-p.getX(a))/width, dz=(p.getZ(b)-p.getZ(a))/width;
    const bays=width<1.4 ? 0 : Math.max(1,Math.round(width/targetBay));
    for(const i of ids){
      const along=(p.getX(i)-p.getX(a))*dx+(p.getZ(i)-p.getZ(a))*dz;
      const y=p.getY(i)-minimumY-plan.foundation;
      layout.set([bays ? along/width*bays : -1,plan.floors ? y/plan.floorHeight : -1,along,y],i*4);
      // Floors end below the cornice: encode a blank band above the last floor.
      // The interpolated floor coordinate remains linear. The last floor is
      // complete because the .3 m top strip contains no opening center.
      // Integer part stores the last complete floor; fraction stores frame width.
      openings.set([Number(style.width)||0.55,Number(style.height)||0.56,plan.floors+(Number(style.frame)||0.05),glazing],i*4);
    }
  }
  geometry.setAttribute('facadeLayout',new THREE.BufferAttribute(layout,4));
  geometry.setAttribute('facadeOpening',new THREE.BufferAttribute(openings,4));
  return {...plan,attributeBytes:layout.byteLength+openings.byteLength};
}

// Both near and merged-mid materials use precisely the same opening positions.
// Surface imagery supplies masonry grain; no prepainted window image owns layout.
export const FACADE_OPENINGS_GLSL = `
// The catalog owns wall color. Photographed grain modulates its brightness;
// it must not multiply a second dark/weathered albedo into the whole building.
vec3 facadeWallSurface(vec3 tint, vec3 grain) {
  float luminance=dot(grain,vec3(0.2126,0.7152,0.0722));
  return tint*(0.65+0.55*sqrt(clamp(luminance,0.0,1.0)));
}
float facadeBox(vec2 p, vec2 halfSize, float feather) {
  vec2 edge=1.0-smoothstep(halfSize,halfSize+vec2(feather),abs(p));
  return edge.x*edge.y;
}
vec3 facadeOpenings(vec3 wall, vec4 wallLayout, vec4 style) {
  float curtain=1.0-step(-0.5,style.w);
  wall=mix(wall,vec3(0.20,0.26,0.30),curtain);
  if(wallLayout.x<0.0 || wallLayout.y<0.0 || wallLayout.y>=floor(style.z)) return wall;
  float shop=step(0.01,style.w)*(1.0-step(1.0,wallLayout.y));
  vec2 point=vec2(fract(wallLayout.x)-0.5,fract(wallLayout.y)-mix(0.55,0.5,curtain));
  vec2 halfSize=mix(vec2(style.x,style.y)*0.5,vec2(0.465,0.455),curtain);
  halfSize=mix(halfSize,vec2(style.w*0.47,0.39),shop);
  float reveal=facadeBox(point,halfSize+vec2(0.035,0.028),0.008);
  float outer=facadeBox(point,halfSize,0.006);
  float inner=facadeBox(point,max(vec2(0.02),halfSize-vec2(mix(fract(style.z),0.016,curtain))),0.006);
  vec3 frame=mix(wall*0.55,vec3(0.22,0.25,0.26),curtain);
  float reflection=smoothstep(-halfSize.y,halfSize.y,point.y);
  float room=fract(sin(dot(floor(wallLayout.xy),vec2(12.9898,78.233)))*43758.5453);
  vec3 glass=mix(vec3(0.075,0.115,0.14),vec3(0.32,0.43,0.48),reflection*0.6+room*0.12);
  vec3 result=mix(wall,wall*0.48,reveal);
  result=mix(result,frame,outer);
  result=mix(result,glass,inner);
  float mullion=(1.0-smoothstep(0.006,0.015,abs(point.x)))*inner;
  result=mix(result,frame,mullion);
  float sill=facadeBox(point+vec2(0.0,halfSize.y+0.028),vec2(halfSize.x+0.045,0.018),0.006);
  return mix(result,wall*1.18,sill*(1.0-curtain));
}
`;

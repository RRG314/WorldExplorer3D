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
  if (options.openings === false) plan.floors = 0;
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
// Screen derivatives recover the wall's metre-space basis after arbitrary
// rotations and spatial batching. No extra vertex attributes or room meshes.
vec3 facadeViewRay(vec3 viewPosition, vec2 wallMeters) {
  vec3 dx=dFdx(-viewPosition),dy=dFdy(-viewPosition);
  vec2 ux=dFdx(wallMeters),uy=dFdy(wallMeters);
  float orientation=sign(ux.x*uy.y-ux.y*uy.x);
  vec3 tangent=normalize((dx*uy.y-dy*ux.y)*orientation);
  vec3 up=normalize((dy*ux.x-dx*uy.x)*orientation);
  vec3 towardCamera=normalize(viewPosition);
  return vec3(dot(towardCamera,tangent),dot(towardCamera,up),
    max(0.12,abs(dot(towardCamera,normalize(cross(tangent,up))))));
}
vec3 facadeRoom(vec2 point, vec2 halfSize, vec3 viewRay, float seed, float shop) {
  vec3 origin=vec3(clamp(point/halfSize,vec2(-.999),vec2(.999)),0.0);
  // Rooms have finite depth: at an oblique angle a side wall occludes the
  // back wall. Looking through the same window produces continuous parallax.
  vec3 ray=vec3(-viewRay.xy*mix(.72,.95,shop)/halfSize,-viewRay.z);
  vec3 safeRay=mix(vec3(-1.0),vec3(1.0),step(vec3(0.0),ray))*max(abs(ray),vec3(.0001));
  vec3 hitTimes=(sign(safeRay)-origin)/safeRay;
  vec3 hit=origin+ray*min(hitTimes.x,min(hitTimes.y,hitTimes.z));
  float back=step(abs(hit.z+1.0),.002);
  float ceiling=step(.998,hit.y);
  float floorSurface=step(hit.y,-.998);
  vec3 paint=mix(vec3(.115,.101,.082),vec3(.22,.19,.14),seed);
  vec3 room=paint*mix(.58,1.0,back);
  room=mix(room,vec3(.055,.043,.028),floorSurface);
  room=mix(room,vec3(.24,.215,.17),ceiling);
  float edgeShade=smoothstep(0.0,.22,1.0-max(abs(hit.x),abs(hit.y)));
  room*=mix(.7,1.0,edgeShade*back);
  // Restrained shelves/display volumes in retail; varied blinds upstairs.
  float shelf=(1.0-smoothstep(.025,.045,abs(hit.y+.28)))*back;
  float objects=step(.19,fract(hit.x*4.0+seed))*step(-.24,hit.y)*step(hit.y,.12)*back;
  room=mix(room,vec3(.055,.040,.027),shop*shelf);
  room=mix(room,mix(vec3(.27,.15,.075),vec3(.075,.17,.16),seed),objects*shop*.70);
  float blind=step(.57,seed)*step(mix(.12,.73,seed),point.y/halfSize.y);
  float slat=.86+.14*smoothstep(.07,.15,abs(fract(point.y*35.0)-.5));
  room=mix(room,vec3(.25,.235,.20)*slat,blind*(1.0-shop));
  return room;
}
float facadeRoomSeed(vec2 cell, float buildingSeed) {
  return fract(sin(dot(floor(cell)+vec2(buildingSeed,buildingSeed*.37),vec2(12.9898,78.233)))*43758.5453);
}
// RGB is the surface albedo; alpha is glazing coverage for physical response.
vec4 facadeOpenings(vec3 wall, vec4 wallLayout, vec4 style, vec3 viewRay, float buildingSeed) {
  float pixelWidth=max(fwidth(wallLayout.x),fwidth(wallLayout.y));
  float edgeWidth=clamp(pixelWidth,0.004,0.25);
  float curtain=1.0-step(-0.5,style.w);
  wall=mix(wall,vec3(0.055,0.072,0.08),curtain);
  // Ground contact and a restrained base course anchor otherwise flat walls.
  wall*=mix(.73,1.0,smoothstep(0.0,.65,wallLayout.w));
  if(wallLayout.x<0.0 || wallLayout.y<0.0 || wallLayout.y>=floor(style.z)) return vec4(wall,0.0);
  float shop=step(0.01,style.w)*(1.0-step(1.0,wallLayout.y));
  vec2 point=vec2(fract(wallLayout.x)-0.5,fract(wallLayout.y)-mix(0.55,0.5,curtain));
  vec2 halfSize=mix(vec2(style.x,style.y)*0.5,vec2(0.465,0.455),curtain);
  halfSize=mix(halfSize,vec2(style.w*0.47,0.39),shop);
  float reveal=facadeBox(point,halfSize+vec2(0.025,0.023),max(0.005,edgeWidth));
  float outer=facadeBox(point,halfSize,edgeWidth);
  float inner=facadeBox(point,max(vec2(0.02),halfSize-vec2(mix(fract(style.z),0.012,curtain))),edgeWidth);
  vec3 frame=mix(wall*.30,vec3(.035,.041,.043),max(curtain,shop));
  float room=facadeRoomSeed(wallLayout.xy,buildingSeed);
  vec3 interior=facadeRoom(point,halfSize,viewRay,room,shop);
  // Environment specular is added by MeshStandardMaterial. A subtle cool
  // albedo tint avoids the previous painted sky-gradient windows.
  float fresnel=pow(1.0-viewRay.z,4.0);
  vec3 glass=mix(interior,vec3(.08,.13,.16),.12+fresnel*.6);
  vec3 result=mix(wall,wall*.36,reveal);
  result=mix(result,frame,outer);
  result=mix(result,glass,inner);
  float mullion=(1.0-smoothstep(0.004,0.010+edgeWidth,abs(point.x)))*inner;
  result=mix(result,frame,mullion);
  float sill=facadeBox(point+vec2(0.0,halfSize.y+0.023),vec2(halfSize.x+0.035,0.014),edgeWidth);
  result=mix(result,wall*1.12,sill*(1.0-curtain));
  float coverage=clamp(4.0*halfSize.x*halfSize.y,0.0,1.0);
  vec3 average=mix(wall,vec3(.095,.115,.12),coverage);
  float lod=smoothstep(0.18,0.75,pixelWidth);
  return vec4(mix(result,average,lod),mix(inner-mullion,coverage,lod));
}

vec3 facadeGrainNormal(vec3 normal, vec3 viewPosition, float height, float strength) {
  vec3 dx=dFdx(-viewPosition),dy=dFdy(-viewPosition);
  vec3 r1=cross(dy,normal),r2=cross(normal,dx);
  float determinant=dot(dx,r1);
  vec3 gradient=r1*dFdx(height)+r2*dFdy(height);
  return normalize(abs(determinant)*normal-sign(determinant)*strength*gradient);
}
`;

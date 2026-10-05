// One shared uniform; the existing night-lighting owner updates it once per
// frame. Window illumination adds no lights, materials, textures or objects.
export const facadeNightUniform = { value: 0 };

export const FACADE_EMISSION_GLSL = `
  float occupiedRoom=facadeRoomSeed(vFacadeLayout.xy,facadeBuildingSeed);
  float retailRoom=step(.01,vFacadeOpening.w)*(1.0-step(1.0,vFacadeLayout.y));
  float roomOn=max(retailRoom,step(.62,occupiedRoom));
  totalEmissiveRadiance += facadeSurface.rgb*vec3(2.8,2.15,1.35)*facadeSurface.a*roomOn*facadeNight;
`;

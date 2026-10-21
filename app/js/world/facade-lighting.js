// One shared uniform; the existing night-lighting owner updates it once per
// frame. Window illumination adds no lights, materials, textures or objects.
export const facadeNightUniform = { value: 0 };

export const FACADE_EMISSION_GLSL = `
  totalEmissiveRadiance += facadeRoomEmission(facadeSurface.rgb,vFacadeLayout.xy,
    facadeSeed,vFacadeOpening.w,facadeNight)*facadeSurface.a;
`;

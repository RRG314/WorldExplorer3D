// One presentation contract for detailed and regional facades. Geometry,
// collision, mapped use and enterability remain with the world authorities.
export const FACADE_PRESENTATION = Object.freeze({ version: 'facade-presentation-v1',
  glassRoughness: .22, glassMetalness: .12, occupiedThreshold: .62,
  detailFadeStartMeters: 400, detailFadeEndMeters: 900,
  roomEmission: Object.freeze([2.8, 2.15, 1.35]) });
const gl = value => Number(value).toFixed(5);
export const FACADE_PRESENTATION_GLSL = `
float facadeDetailWeight(float distanceMeters){
  return 1.0-smoothstep(${gl(FACADE_PRESENTATION.detailFadeStartMeters)},${gl(FACADE_PRESENTATION.detailFadeEndMeters)},distanceMeters);
}
float facadeBuildingSeed(vec3 tint){return dot(floor(tint*16.0+.001),vec3(17.0,3.0,7.0));}
vec3 facadeRoomEmission(vec3 surface,vec2 roomLayout,float seed,float storefront,float night){
  float retail=step(.01,storefront)*(1.0-step(1.0,roomLayout.y));
  float occupied=max(retail,step(${gl(FACADE_PRESENTATION.occupiedThreshold)},facadeRoomSeed(roomLayout,seed)));
  return surface*vec3(${FACADE_PRESENTATION.roomEmission.map(gl).join(',')})*occupied*night;
}
`;

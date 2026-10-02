// Shared wake formula: GLSL reference expression and CSP-safe CPU contact evaluator.
// Keep inputs bounded at their simulation owner; no real-current claim is made.
const WAKE_EXPRESSION = `
  smoothstep(0.0, 1.0, stern) * exp(-stern * 0.045) *
    (exp(-pow((abs(side) - (0.44 + stern * (0.14 + spread * 0.1))) / (0.6 + stern * 0.02), 2.0)) * 0.76
     - exp(-pow(side / (0.92 + stern * 0.06), 2.0)) * 0.22) * (0.12 + strength * 0.42)
  + exp(-pow(side / max(0.9, 0.36 + bow * 0.18), 2.0)) * smoothstep(0.0, 2.2, bow)
    * (1.0 - smoothstep(5.4, 9.2, bow)) * (0.04 + bowWave * 0.18 + splash * 0.08)`;
const smoothstep = (lo,hi,x) => {const t=Math.max(0,Math.min(1,(x-lo)/(hi-lo)));return t*t*(3-2*t);};
// The evaluator is written explicitly for CSP compatibility (no runtime eval).
export function sampleBoatWakeHeight(x,z,wake) {
  if (!wake) return 0;
  const dx=x-wake.x,dz=z-wake.z;
  const side=dx*wake.forwardZ-dz*wake.forwardX;
  const along=dx*wake.forwardX+dz*wake.forwardZ;
  const stern=Math.max(0,-along),bow=Math.max(0,along);
  const band=Math.exp(-Math.pow((Math.abs(side)-(0.44+stern*(0.14+wake.spread*0.1)))/(0.6+stern*0.02),2));
  const core=Math.exp(-Math.pow(side/(0.92+stern*0.06),2));
  return smoothstep(0,1,stern)*Math.exp(-stern*0.045)*(band*0.76-core*0.22)*(0.12+wake.strength*0.42)
    +Math.exp(-Math.pow(side/Math.max(0.9,0.36+bow*0.18),2))*smoothstep(0,2.2,bow)*(1-smoothstep(5.4,9.2,bow))*(0.04+wake.bowWave*0.18+wake.splash*0.08);
}
export function boatWakeSnapshot(ctx) {
  if (!ctx.boatMode?.active || !ctx.boat) return null;
  const boat=ctx.boat,mode=ctx.boatMode,angle=Number(boat.angle)||0;
  return {x:Number(boat.x)||0,z:Number(boat.z)||0,forwardX:Math.sin(angle),forwardZ:Math.cos(angle),
    strength:Number(mode.wakeStrength)||0,spread:Number(mode.wakeSpread)||0,
    bowWave:Number(mode.bowWaveStrength)||0,splash:Number(mode.bowSplashStrength)||0};
}
export function boatWakeShaderFunction() {
 return `float weBoatWakeDisplacement(vec2 worldXZ) {
  vec2 local = weBoatToLocal(worldXZ);
  float side = local.x;
  float stern = max(0.0, -local.y);
  float bow = max(0.0, local.y);
  float spread = weBoatWakeSpread;
  float strength = weBoatWakeStrength;
  float bowWave = weBoatBowWave;
  float splash = weBoatBowSplash;
  return ${WAKE_EXPRESSION};
}`;
}
export { WAKE_EXPRESSION };

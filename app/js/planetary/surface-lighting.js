// Exposure compensation for the render lights only. Physical irradiance,
// temperature and gravity remain in the physical-environment authority.
export function surfaceLightingGain({sunIntensity=0,ambientIntensity=0,fillIntensity=0}) {
  const total=Math.max(0,sunIntensity)+Math.max(0,ambientIntensity)+Math.max(0,fillIntensity);
  return total>0 ? Math.max(1,2.4/total) : 1;
}

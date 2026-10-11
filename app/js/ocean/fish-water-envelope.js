// Scene-space envelope; bathymetry evidence is deliberately not substituted for
// the rendered bottom or for the fish's depth in the water column.
export function fitFishToWater({x,y,z,radius=.4,water,depthBand=[1,30],nearBottom=false}) {
  const volume=water?.volume || water;
  const surface=volume?.surfaceY,bottom=volume?.bottomY,units=volume?.metersPerWorldUnit;
  if(![x,y,z,radius,surface,bottom,units,...depthBand].every(Number.isFinite)||units<=0||radius<=0||bottom>=surface)return null;
  const low=Math.max(bottom+radius+.15,surface-depthBand[1]/units);
  const high=surface-Math.max(radius+.15,depthBand[0]/units);
  if(low>high)return null;
  // Bottom-associated animals must fit near the actual game bed, not float
  // hundreds of metres over a deep bottom at their preferred depth limit.
  const bottomTarget=bottom+radius+.25;
  if(nearBottom&&bottomTarget<low-.1)return null;
  return {x,y:Math.max(low,Math.min(high,nearBottom?bottomTarget:y)),z};
}

export function fishSeededRandom(text) {
  let seed=2166136261;
  for(const char of String(text)){seed^=char.charCodeAt(0);seed=Math.imul(seed,16777619);}
  return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
}

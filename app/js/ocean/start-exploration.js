// Fresh globe journeys begin aboard the existing research-vessel authority.
// Saved underwater voyages and explicit submarine launches retain their mode.
import {validateOceanVoyage} from './voyage-store.js';
export async function startOceanExploration(ctx,options={}) {
  if(options.voyageResume) {
    const saved=validateOceanVoyage(options.voyageResume);
    if(!saved)return false;
    return saved.stage==='aboard' ? !!await ctx.startSurfaceResearchVoyage({...options,voyageResume:saved})
      : !!await ctx.startOceanMode({...options,voyageResume:saved});
  }
  if (options.parentVessel) return !!await ctx.startOceanMode(options);
  return !!await ctx.startSurfaceResearchVoyage(options);
}

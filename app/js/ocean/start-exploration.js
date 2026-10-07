// Fresh globe journeys begin aboard the existing research-vessel authority.
// Saved underwater voyages and explicit submarine launches retain their mode.
export async function startOceanExploration(ctx,options={}) {
  if (options.voyageResume || options.parentVessel) return !!await ctx.startOceanMode(options);
  return !!await ctx.startSurfaceResearchVoyage(options);
}

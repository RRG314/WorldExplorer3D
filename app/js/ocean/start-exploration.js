// Fresh globe journeys begin aboard the existing research-vessel authority.
// Saved underwater voyages and explicit submarine launches retain their mode.
export async function startOceanExploration(ctx,options={}) {
  if (!await ctx.startOceanMode(options)) return false;
  if (options.voyageResume || options.parentVessel) return true;
  return !!await ctx.transferSubmarineToBoat({source:'ocean-exploration-start',enterDeck:true});
}

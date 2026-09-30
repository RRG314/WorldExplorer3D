// Samples are finite and sorted by the accepted-ground sampling pass. Keep its
// robust relief envelope, but extend support all the way to its downhill edge.
export function resolveBuildingFoundation({elevationValues, medianElevation=0, height, footprintWidth, footprintDepth}) {
  const count=elevationValues.length;
  const reliefLimit=Math.min(18,Math.max(4,height*.65,Math.min(footprintWidth,footprintDepth)*.4));
  const low=count?elevationValues[Math.floor((count-1)*.15)]:medianElevation;
  const high=count?elevationValues[Math.ceil((count-1)*.85)]:medianElevation;
  const minElevation=Math.max(low,medianElevation-reliefLimit);
  const maxElevation=Math.min(high,medianElevation+reliefLimit);
  const avgElevation=count?elevationValues.reduce((sum,y)=>sum+y,0)/count:medianElevation;
  const slopeRange=Math.max(0,maxElevation-minElevation);
  // A 12 m skirt cap left a floating lower wall whenever accepted relief was
  // greater than 12 m. This adds vertical support, not another terrain layer.
  const terrainFoundationRise=slopeRange>=.06?slopeRange:0;
  const baseElevationRaw=terrainFoundationRise>0?minElevation+.03:avgElevation;
  return {minElevation,maxElevation,avgElevation,slopeRange,terrainFoundationRise,baseElevationRaw};
}

// Source cross sections remain in metres. Meshes and spatial queries use
// world coordinates; convert at that boundary exactly once.
export function roadMetersPerWorldUnit(feature) {
  const scale=Number(feature?.metersPerWorldUnit ?? 1);
  if(!Number.isFinite(scale)||scale<=0)throw new RangeError('Invalid road coordinate scale');
  return scale;
}
export function roadPlacementOffsetWorld(feature) {
  return (Number(feature?.transportRecord?.crossSection?.placement?.centerlineOffsetMeters)||0)/roadMetersPerWorldUnit(feature);
}
export function roadDimensionsFromSource(transportRecord,metersPerWorldUnit) {
  const scale=roadMetersPerWorldUnit({metersPerWorldUnit});
  const meters=Number(transportRecord?.crossSection?.widthMeters);
  if(!Number.isFinite(meters)||meters<=0)throw new RangeError('Invalid source road width');
  return {width:meters/scale,metersPerWorldUnit:scale};
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function waterBedDepthAtShorelineDistance(distance, options = {}) {
  const featherDistance = Math.max(0.01, Number(options.featherDistance) || 6);
  const maximumDepth = Math.max(0, Number(options.maximumDepth) || 0.6);
  const blend = clamp01(Math.max(0, Number(distance) || 0) / featherDistance);
  const smoothBlend = blend * blend * (3 - 2 * blend);
  return maximumDepth * smoothBlend;
}

export { waterBedDepthAtShorelineDistance };

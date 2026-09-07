// Shared physical dimensions for compilation, presentation, and camera probes.
export const TUNNEL_ROOF_THICKNESS = 0.32;
export const MINIMUM_TUNNEL_ROOF_COVER = 0.75;
export const TUNNEL_SECTION_LATERAL = Object.freeze([-1, -1, -0.76, 0, 0.76, 1, 1]);
export const TUNNEL_SECTION_HEIGHT = Object.freeze([0.02, 0.56, 0.84, 1, 0.84, 0.56, 0.02]);

export function canPublishTunnelGeometry(feature) {
  const record = feature?.transportRecord;
  if (feature?.structureSemantics?.terrainMode !== 'subgrade' ||
      record?.routeState !== 'complete' || record?.safeForDriving === false) return false;
  return record?.completeness === 'lossless' ||
    (record?.completeness === 'generalized' && feature?.tunnelSystemModel?.visualKind === 'tunnel');
}

export function tunnelClearance(semantics = {}) {
  return Math.max(3.2, Math.min(5.2, (Number(semantics.cutDepth) || 4.6) - 0.25));
}

export function tunnelMinimumDepth(semantics = {}) {
  // Includes the road's 8 cm presentation bias and a small numerical margin.
  return Math.max(Number(semantics.cutDepth) || 4.6,
    tunnelClearance(semantics) + TUNNEL_ROOF_THICKNESS + MINIMUM_TUNNEL_ROOF_COVER + 0.18);
}

export function tunnelCeilingHeight(clearance, halfWidth, lateralDistance) {
  const t = Math.min(1, Math.max(0, Math.abs(lateralDistance) / halfWidth));
  const factor = t <= 0.76 ? 1 - t / 0.76 * 0.16 : 0.84 - (t - 0.76) / 0.24 * 0.28;
  return clearance * factor;
}

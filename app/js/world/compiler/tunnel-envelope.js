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
  // Parking aisles carry passenger vehicles, not the full-size road envelope.
  // Keep a conservative walkable enclosure when no measured headroom exists.
  // Cut depth describes burial and must not enlarge this vehicle clearance.
  if (semantics.parkingAccess === true) return 3.2;
  return Math.max(3.2, Math.min(5.2, (Number(semantics.cutDepth) || 4.6) - 0.25));
}

export function tunnelRoofHalfWidth(width) {
  // Match the published shell/portal and collider outside face exactly:
  // carriageway half-width, 2 cm lining offset, then the 35 cm outer rim.
  // The old extra 95 cm swept adjacent buildings into the tunnel ceiling.
  return Math.max(3.4, Number(width) || 6) * .5 + .02 + Math.max(.35, TUNNEL_ROOF_THICKNESS);
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

// Pure bound query shared by surface compilation and obstruction consumers.
export function tunnelObstructionMaximumY(limits, distance) {
  let ceiling = Infinity;
  for (const limit of limits || []) {
    if (distance >= limit.start - 1e-5 && distance <= limit.end + 1e-5) ceiling = Math.min(ceiling, limit.maximumSurfaceY);
  }
  return ceiling;
}

function finitePositive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Reject source footprints that would render as skyline needles. These are
 * invalid building polygons, not roofs, so they must be stopped before mesh
 * and collision publication in every building LOD.
 */
function assessTallBuildingFootprint(options = {}) {
  const heightMeters = finitePositive(options.heightMeters);
  const widthMeters = finitePositive(options.widthMeters);
  const depthMeters = finitePositive(options.depthMeters);
  const footprintAreaMeters = finitePositive(options.footprintAreaMeters);
  const intentionalVerticalStructure = options.intentionalVerticalStructure === true;
  const minSpanMeters = widthMeters && depthMeters
    ? Math.min(widthMeters, depthMeters)
    : widthMeters || depthMeters;
  const requiredSpanMeters = Math.max(2.8, Math.min(6, heightMeters * 0.03));
  const requiredAreaMeters = Math.max(16, Math.min(90, heightMeters * 0.35));
  const tall = heightMeters >= 24;
  const tooThin = minSpanMeters > 0 && minSpanMeters < requiredSpanMeters;
  const tooSmallForHeight =
    footprintAreaMeters > 0 &&
    footprintAreaMeters < requiredAreaMeters &&
    minSpanMeters > 0 &&
    minSpanMeters < 8;
  const rejected = tall && !intentionalVerticalStructure && (tooThin || tooSmallForHeight);

  return {
    rejected,
    heightMeters,
    minSpanMeters,
    footprintAreaMeters,
    requiredSpanMeters,
    requiredAreaMeters,
    reason: rejected ? 'implausible-tall-sliver' : null
  };
}

function isImplausibleTallBuildingFootprint(options = {}) {
  return assessTallBuildingFootprint(options).rejected;
}

export {
  assessTallBuildingFootprint,
  isImplausibleTallBuildingFootprint
};

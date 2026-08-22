const MIN_PUBLISHED_ROAD_WIDTH_METERS = 1.2;
const MIN_DRIVEABLE_ROAD_WIDTH_METERS = 4.8;
const WIDTH_TRANSITION_METERS = 8;

function finiteWidth(value, fallback = 4) {
  const width = Number(value);
  return Number.isFinite(width) && width > 0
    ? Math.max(MIN_PUBLISHED_ROAD_WIDTH_METERS, width)
    : Math.max(MIN_PUBLISHED_ROAD_WIDTH_METERS, Number(fallback) || 4);
}

function sourceRoadWidthMeters(feature) {
  return finiteWidth(
    feature?.resolvedCrossSection?.sourceWidthMeters,
    feature?.transportRecord?.crossSection?.widthMeters || feature?.width
  );
}

function segmentWidths(feature) {
  const widths = feature?.resolvedCrossSection?.segmentWidthsMeters;
  return widths instanceof Float32Array || Array.isArray(widths) ? widths : null;
}

function segmentProfiles(feature, segmentIndex) {
  const profiles = feature?.resolvedCrossSection?.segmentProfiles;
  if (!Array.isArray(profiles)) return [];
  const index = Math.max(0, Math.min(profiles.length - 1, Number(segmentIndex) || 0));
  return Array.isArray(profiles[index]) ? profiles[index] : [];
}

function segmentLength(feature, segmentIndex) {
  const points = feature?.pts;
  if (!Array.isArray(points) || points.length < 2) return 0;
  const index = Math.max(0, Math.min(points.length - 2, Number(segmentIndex) || 0));
  return Math.hypot(
    Number(points[index + 1]?.x) - Number(points[index]?.x),
    Number(points[index + 1]?.z) - Number(points[index]?.z)
  );
}

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  return t * t * (3 - 2 * t);
}

function roadWidthAtSegment(feature, segmentIndex = 0, segmentT = 0.5) {
  const sourceWidth = sourceRoadWidthMeters(feature);
  const widths = segmentWidths(feature);
  if (!widths || widths.length === 0) return finiteWidth(feature?.width, sourceWidth);

  const index = Math.max(0, Math.min(widths.length - 1, Number(segmentIndex) || 0));
  const localWidth = finiteWidth(widths[index], sourceWidth);
  const length = segmentLength(feature, index);
  const t = Math.max(0, Math.min(1, Number(segmentT) || 0));
  const intervalProfiles = feature?.resolvedCrossSection?.intervalProfiles;
  const segmentStartDistances = feature?.resolvedCrossSection?.segmentStartDistancesMeters;
  if ((intervalProfiles instanceof Array) &&
      (segmentStartDistances instanceof Float64Array || Array.isArray(segmentStartDistances)) &&
      Number.isFinite(Number(segmentStartDistances[index]))) {
    const distance = Number(segmentStartDistances[index]) + length * t;
    let resolvedWidth = sourceWidth;
    for (const profile of intervalProfiles) {
      const startDistance = Number(profile?.startDistanceMeters);
      const endDistance = Number(profile?.endDistanceMeters);
      if (!Number.isFinite(startDistance) || !Number.isFinite(endDistance)) continue;
      const gap = distance < startDistance
        ? startDistance - distance
        : distance > endDistance
          ? distance - endDistance
          : 0;
      if (gap >= WIDTH_TRANSITION_METERS) continue;
      const width = finiteWidth(profile?.widthMeters, sourceWidth);
      const candidateWidth = gap <= 0
        ? width
        : width + (sourceWidth - width) * smoothstep(gap / WIDTH_TRANSITION_METERS);
      resolvedWidth = Math.min(resolvedWidth, candidateWidth);
    }
    return finiteWidth(resolvedWidth, sourceWidth);
  }
  const profiles = segmentProfiles(feature, index);
  if (profiles.length > 0 && length > 1e-5) {
    let resolvedWidth = sourceWidth;
    const transitionFraction = Math.min(0.5, WIDTH_TRANSITION_METERS / length);
    for (const profile of profiles) {
      const startT = Math.max(0, Math.min(1, Number(profile?.startT) || 0));
      const endT = Math.max(startT, Math.min(1, Number(profile?.endT) || 0));
      const width = finiteWidth(profile?.widthMeters, sourceWidth);
      let candidateWidth = sourceWidth;
      if (t >= startT && t <= endT) {
        candidateWidth = width;
      } else if (t < startT && startT - t < transitionFraction) {
        candidateWidth = width + (sourceWidth - width) * smoothstep((startT - t) / transitionFraction);
      } else if (t > endT && t - endT < transitionFraction) {
        candidateWidth = width + (sourceWidth - width) * smoothstep((t - endT) / transitionFraction);
      }
      resolvedWidth = Math.min(resolvedWidth, candidateWidth);
    }
    return finiteWidth(resolvedWidth, sourceWidth);
  }
  if (!(length > 1e-5)) return localWidth;

  const transitionFraction = Math.min(0.5, WIDTH_TRANSITION_METERS / length);
  let resolvedWidth = localWidth;
  if (index > 0 && t < transitionFraction) {
    const vertexWidth = Math.min(localWidth, finiteWidth(widths[index - 1], sourceWidth));
    resolvedWidth = Math.min(
      resolvedWidth,
      vertexWidth + (localWidth - vertexWidth) * smoothstep(t / transitionFraction)
    );
  }
  if (index < widths.length - 1 && 1 - t < transitionFraction) {
    const vertexWidth = Math.min(localWidth, finiteWidth(widths[index + 1], sourceWidth));
    resolvedWidth = Math.min(
      resolvedWidth,
      vertexWidth + (localWidth - vertexWidth) * smoothstep((1 - t) / transitionFraction)
    );
  }
  return finiteWidth(resolvedWidth, sourceWidth);
}

function roadWidthAtProjection(feature, projection = null) {
  return roadWidthAtSegment(
    feature,
    Number(projection?.segIndex) || 0,
    Number.isFinite(Number(projection?.t)) ? Number(projection.t) : 0.5
  );
}

function minimumRoadWidthOnInterval(feature, segmentIndex = 0, startT = 0, endT = 1) {
  const start = Math.max(0, Math.min(1, Number(startT) || 0));
  const end = Math.max(0, Math.min(1, Number(endT) || 0));
  const midpoint = (start + end) * 0.5;
  const samples = [start, midpoint, end];
  for (const profile of segmentProfiles(feature, segmentIndex)) {
    const profileStart = Math.max(start, Math.min(end, Number(profile?.startT) || 0));
    const profileEnd = Math.max(start, Math.min(end, Number(profile?.endT) || 0));
    samples.push(profileStart, profileEnd, (profileStart + profileEnd) * 0.5);
  }
  return Math.min(...samples.map((sampleT) =>
    roadWidthAtSegment(feature, segmentIndex, sampleT)
  ));
}

function roadSegmentIsDriveable(feature, segmentIndex = 0, startT = 0, endT = 1) {
  return feature?.driveable !== false &&
    minimumRoadWidthOnInterval(feature, segmentIndex, startT, endT) >=
      MIN_DRIVEABLE_ROAD_WIDTH_METERS;
}

export {
  MIN_DRIVEABLE_ROAD_WIDTH_METERS,
  MIN_PUBLISHED_ROAD_WIDTH_METERS,
  WIDTH_TRANSITION_METERS,
  minimumRoadWidthOnInterval,
  roadSegmentIsDriveable,
  roadWidthAtProjection,
  roadWidthAtSegment,
  sourceRoadWidthMeters
};

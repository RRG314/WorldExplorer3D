const METERS_PER_LATITUDE_DEGREE = 111_320;

function isLandmarkOwnedBuilding(tags = {}) {
  const roofShape = String(tags['roof:shape'] || '').toLowerCase();
  return tags.tomb === 'pyramid' || roofShape === 'pyramid' || roofShape === 'pyramidal';
}

function wayCoordinates(way, nodes) {
  const coordinates = way?._coordinates?.length >= 6
    ? Array.from({ length: Math.floor(way._coordinates.length / 2) }, (_, index) => ({
      lon: way._coordinates[index * 2],
      lat: way._coordinates[index * 2 + 1]
    }))
    : (way?.nodes || [])
      .map((nodeId) => nodes.get(nodeId))
      .filter((node) => Number.isFinite(node?.lat) && Number.isFinite(node?.lon))
      .map((node) => ({ lat: Number(node.lat), lon: Number(node.lon) }));
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (coordinates.length > 2 && first.lat === last.lat && first.lon === last.lon) coordinates.pop();
  return coordinates;
}

function footprintMetrics(coordinates) {
  if (coordinates.length < 3) return null;
  const latitude = coordinates.reduce((sum, point) => sum + point.lat, 0) / coordinates.length;
  const longitude = coordinates.reduce((sum, point) => sum + point.lon, 0) / coordinates.length;
  const longitudeScale = METERS_PER_LATITUDE_DEGREE * Math.max(0.25, Math.cos(latitude * Math.PI / 180));
  const points = coordinates.map((point) => ({
    x: (point.lon - longitude) * longitudeScale,
    y: (point.lat - latitude) * METERS_PER_LATITUDE_DEGREE
  }));
  let doubledArea = 0;
  let radius = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    doubledArea += point.x * next.y - next.x * point.y;
    radius = Math.max(radius, Math.hypot(point.x, point.y));
  }
  return { latitude, longitude, area: Math.abs(doubledArea) * 0.5, radius };
}

function footprintMatch(candidate, landmark) {
  if (!candidate || !landmark || candidate.area < 4 || landmark.area < 4) return false;
  const longitudeScale = METERS_PER_LATITUDE_DEGREE * Math.max(
    0.25,
    Math.cos(landmark.latitude * Math.PI / 180)
  );
  const centerDistance = Math.hypot(
    (candidate.longitude - landmark.longitude) * longitudeScale,
    (candidate.latitude - landmark.latitude) * METERS_PER_LATITUDE_DEGREE
  );
  const areaRatio = candidate.area / landmark.area;
  return centerDistance <= Math.max(5, landmark.radius * 0.18) && areaRatio >= 0.45 && areaRatio <= 2.2;
}

function distanceBetween(candidate, landmark) {
  const longitudeScale = METERS_PER_LATITUDE_DEGREE * Math.max(
    0.25,
    Math.cos(landmark.lat * Math.PI / 180)
  );
  return Math.hypot(
    (candidate.longitude - landmark.lon) * longitudeScale,
    (candidate.latitude - landmark.lat) * METERS_PER_LATITUDE_DEGREE
  );
}

export function createLandmarkBuildingOwnership(data, curatedLandmarks = []) {
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const nodes = new Map(elements
    .filter((element) => element?.type === 'node')
    .map((node) => [node.id, node]));
  const footprints = elements
    .filter((element) => element?.type === 'way' && isLandmarkOwnedBuilding(element.tags))
    .map((way) => ({
      sourceId: String(way.id),
      metrics: footprintMetrics(wayCoordinates(way, nodes))
    }))
    .filter((entry) => entry.metrics);

  const curated = curatedLandmarks.filter((landmark) =>
    Number.isFinite(landmark?.lat) && Number.isFinite(landmark?.lon)
  );

  return {
    footprintCount: footprints.length,
    curatedCount: curated.length,
    partition(ways, buildingNodes) {
      if (footprints.length === 0 && curated.length === 0) {
        return { selected: ways, suppressed: [] };
      }
      const candidates = ways.map((way) => ({
        way,
        metrics: footprintMetrics(wayCoordinates(way, buildingNodes))
      }));
      const suppressed = new Set();

      candidates.forEach((candidate) => {
        if (footprints.some((landmark) => footprintMatch(candidate.metrics, landmark.metrics))) {
          suppressed.add(candidate.way);
        }
      });
      curated.forEach((landmark) => {
        const representedByFootprint = footprints.some((footprint) =>
          distanceBetween(footprint.metrics, landmark) <= Math.max(5, footprint.metrics.radius * 0.2)
        );
        if (representedByFootprint) return;
        const nearest = candidates
          .filter((candidate) => candidate.metrics && !suppressed.has(candidate.way))
          .map((candidate) => ({ candidate, distance: distanceBetween(candidate.metrics, landmark) }))
          .filter((entry) => entry.distance <= Math.max(8, Number(landmark.hideRadiusMeters) || 0))
          .sort((a, b) => a.distance - b.distance)[0];
        if (nearest) suppressed.add(nearest.candidate.way);
      });

      return {
        selected: candidates.filter((candidate) => !suppressed.has(candidate.way)).map((candidate) => candidate.way),
        suppressed: candidates.filter((candidate) => suppressed.has(candidate.way)).map((candidate) => candidate.way)
      };
    }
  };
}

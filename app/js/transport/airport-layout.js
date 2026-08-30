function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function recordPoints(record) {
  return Array.isArray(record?.geometry?.points)
    ? record.geometry.points.filter((point) => [point?.x, point?.z].every(Number.isFinite))
    : [];
}

function recordPoint(record) {
  const points = recordPoints(record);
  if (!points.length) return null;
  if (points.length === 1) return points[0];
  if (record?.geometry?.kind === 'polygon') {
    const unique = points.length > 2 && points[0].x === points.at(-1).x && points[0].z === points.at(-1).z
      ? points.slice(0, -1)
      : points;
    return Object.freeze({
      x: unique.reduce((sum, point) => sum + point.x, 0) / unique.length,
      z: unique.reduce((sum, point) => sum + point.z, 0) / unique.length
    });
  }
  return points[Math.floor(points.length * .5)];
}

function recordYaw(record) {
  const points = recordPoints(record);
  if (points.length < 2) return 0;
  const start = points[0];
  const end = points.at(-1);
  return Math.atan2(end.x - start.x, end.z - start.z);
}

function recordLength(record) {
  const points = recordPoints(record);
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z);
  }
  return length;
}

function offsetPoint(origin, yaw, right, forward) {
  return Object.freeze({
    x: finite(origin?.x) + Math.cos(yaw) * right + Math.sin(yaw) * forward,
    z: finite(origin?.z) - Math.sin(yaw) * right + Math.cos(yaw) * forward
  });
}

function isExactMapped(record) {
  return record?.geometryAuthority === 'exact-openstreetmap' ||
    (record?.geometryAuthority == null && record?.provenance?.provider !== 'openstreetmap-shortbread');
}

function distanceBetween(left, right) {
  return left && right ? Math.hypot(left.x - right.x, left.z - right.z) : Infinity;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = ((a.z > point.z) !== (b.z > point.z)) &&
      point.x < (b.x - a.x) * (point.z - a.z) / ((b.z - a.z) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function runwayDesignator(yaw) {
  const heading = ((yaw * 180 / Math.PI) + 360) % 360;
  const number = Math.max(1, Math.min(36, Math.round(heading / 10) || 36));
  return String(number).padStart(2, '0');
}

function airportScale({ locationLabel = '', airportClasses = [], mappedLength = 0, runways = [], terminals = [], aprons = [], mappedStands = [] } = {}) {
  const label = String(locationLabel).toLowerCase();
  const majorLabel = /international|intercontinental/.test(label) ||
    airportClasses.some((value) => /international|intercontinental/.test(String(value).toLowerCase()));
  const majorInfrastructure = mappedLength >= 2200 &&
    (runways.length >= 2 || terminals.length >= 1 || mappedStands.length >= 4);
  if (majorLabel || majorInfrastructure || terminals.length >= 2 || mappedStands.length >= 8) return 'major';
  if (mappedLength >= 900 || terminals.length ||
    /airport|aerodrome|airfield|regional/.test(label)) return 'regional';
  return 'local';
}

function compileAirportOperationalLayout(graph, options = {}) {
  const aviation = Array.isArray(graph?.byDomain?.aviation) ? graph.byDomain.aviation : [];
  if (!aviation.length) return null;
  // Physical airport publication requires exact runway geometry. Generalized
  // airport points remain useful to search/travel, but cannot safely determine
  // runway heading, extent, elevation, or airport membership.
  const runways = aviation.filter((record) => record.type === 'runway' &&
    isExactMapped(record) && recordPoints(record).length >= 2);
  if (!runways.length) return null;
  const mappedPrimary = [...runways].sort((left, right) => recordLength(right) - recordLength(left))[0];
  const primaryCenter = recordPoint(mappedPrimary);
  if (!primaryCenter) return null;
  const membershipRadius = Math.max(1800, Math.min(5200, recordLength(mappedPrimary) * 1.8));
  const belongsToAirport = (record) => isExactMapped(record) &&
    distanceBetween(recordPoint(record), primaryCenter) <= membershipRadius;
  const airportRecords = aviation.filter(belongsToAirport);
  const terminals = airportRecords.filter((record) => record.type === 'terminal');
  const aprons = airportRecords.filter((record) => record.type === 'apron');
  const aerodromes = airportRecords.filter((record) => record.type === 'aerodrome');
  const mappedStands = airportRecords.filter((record) => ['parking_position', 'gate'].includes(record.type));
  const centerRecord = terminals[0] || aprons[0] || aerodromes[0] || mappedPrimary;
  const center = recordPoint(centerRecord) || primaryCenter;
  const mappedLength = recordLength(mappedPrimary);
  const locationLabel = String(options.location?.name || options.location?.city || '').toLowerCase();
  const airportClasses = [
    options.location?.locationDetails?.airportClass,
    options.location?.airportClass,
    ...airportRecords.map((record) => record.attributes?.airportClass)
  ].filter(Boolean);
  const scale = airportScale({ locationLabel, airportClasses, mappedLength, runways, terminals, aprons, mappedStands });
  const large = scale !== 'local';
  const primaryRunway = mappedPrimary;
  const yaw = recordYaw(primaryRunway);
  const length = Math.max(180, recordLength(primaryRunway));
  const width = Math.max(20, finite(primaryRunway.attributes?.width, large ? 46 : 32));
  const runwayPoints = recordPoints(primaryRunway);
  const runwayStart = runwayPoints[0];
  const runwayEnd = runwayPoints.at(-1);
  const standLimits = options.mobile === true
    ? scale === 'major' ? { min: 10, max: 14 } : scale === 'regional' ? { min: 7, max: 10 } : { min: 5, max: 7 }
    : scale === 'major' ? { min: 18, max: 24 } : scale === 'regional' ? { min: 14, max: 18 } : { min: 8, max: 10 };
  const standTarget = Math.max(standLimits.min,
    Math.min(standLimits.max, mappedStands.length + terminals.length * 4 + runways.length * 3));
  const stands = mappedStands.map((record, index) => Object.freeze({
    id: record.id,
    ...recordPoint(record),
    yaw: recordYaw(record) || yaw,
    mapped: true,
    sourceType: record.type,
    index
  })).filter((stand) => [stand.x, stand.z].every(Number.isFinite));
  const standApron = aprons.find((record) => record.geometry?.kind === 'polygon' && recordPoints(record).length >= 4) || null;
  const standEnvelope = standApron ? recordPoints(standApron) : [];
  const standOrigin = recordPoint(standApron || terminals[0]);
  for (let candidateIndex = 0; standOrigin && standEnvelope.length && stands.length < standTarget && candidateIndex < standTarget * 8; candidateIndex += 1) {
    const row = Math.floor(candidateIndex / 6);
    const column = candidateIndex % 6;
    const side = row % 2 === 0 ? 1 : -1;
    const lateral = side * (16 + Math.floor(row / 2) * 24);
    const forward = (column - 2.5) * (scale === 'major' ? 38 : scale === 'regional' ? 30 : 22);
    const point = offsetPoint(standOrigin, yaw, lateral, forward);
    if (!pointInPolygon(point, standEnvelope)) continue;
    const index = stands.length;
    stands.push(Object.freeze({
      id: `generated-airport-layout:stand:${index}`,
      ...point,
      yaw,
      mapped: false,
      generatedActivity: true,
      sourceType: 'generated_stand',
      index
    }));
  }
  const mappedTower = airportRecords.find((record) => record.type === 'control_tower');
  const towerPoint = recordPoint(mappedTower);
  const tower = mappedTower && towerPoint ? Object.freeze({
    id: mappedTower.id,
    ...towerPoint,
    mapped: true,
    generatedActivity: false,
    height: scale === 'major' ? 38 : scale === 'regional' ? 30 : 22
  }) : null;
  const mappedTerminal = terminals[0] || null;
  const ticketPoint = recordPoint(mappedTerminal);
  const ticketCounter = mappedTerminal && ticketPoint ? Object.freeze({
    id: mappedTerminal.id,
    x: ticketPoint.x,
    z: ticketPoint.z,
    yaw,
    mapped: true,
    generatedActivity: false,
    entrance: Object.freeze(offsetPoint(ticketPoint, yaw, 0, large ? 13 : 9))
  }) : null;
  return Object.freeze({
    type: 'AirportOperationalLayout',
    authority: 'compiled-airport-operational-layout',
    mobile: options.mobile === true,
    scale,
    center: Object.freeze({ x: center.x, z: center.z }),
    large,
    yaw,
    runwayLength: length,
    runwayWidth: width,
    runwayDesignator: String(primaryRunway.attributes?.ref || '').trim() || runwayDesignator(yaw),
    primaryRunway,
    runways: Object.freeze(runways),
    runwayStart: Object.freeze({ x: runwayStart.x, z: runwayStart.z }),
    runwayEnd: Object.freeze({ x: runwayEnd.x, z: runwayEnd.z }),
    stands: Object.freeze(stands),
    tower,
    ticketCounter,
    hasMappedTerminal: terminals.length > 0,
    mappedRunway: !!mappedPrimary,
    generatedFallback: false,
    operationalEnvelope: Object.freeze({
      center: Object.freeze({ x: primaryCenter.x, z: primaryCenter.z }),
      radius: membershipRadius,
      apronRecordId: standApron?.id || ''
    }),
    provenance: Object.freeze({
      mappedRecordCount: airportRecords.length,
      mappedStandCount: mappedStands.length,
      mappedRunwayCount: runways.length,
      generatedStandCount: stands.filter((stand) => !stand.mapped).length,
      physicalAuthority: 'exact-openstreetmap-runway-and-apron-membership'
    })
  });
}

export {
  airportScale,
  compileAirportOperationalLayout,
  offsetPoint,
  recordLength,
  recordPoint,
  recordPoints,
  recordYaw,
  runwayDesignator
};

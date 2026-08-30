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

function generatedRunway(center, yaw, length, width) {
  const start = offsetPoint(center, yaw, 0, -length * .5);
  const end = offsetPoint(center, yaw, 0, length * .5);
  return Object.freeze({
    id: 'generated-airport-layout:runway',
    domain: 'aviation',
    type: 'runway',
    name: '',
    mapped: false,
    generatedActivity: true,
    geometry: Object.freeze({ kind: 'path', points: Object.freeze([start, end]), complete: true }),
    attributes: Object.freeze({ width, ref: '', generatedFallback: true }),
    provenance: Object.freeze({
      provider: 'World Explorer gameplay layout',
      license: 'original-game-design',
      attribution: 'Generated airport presentation anchored to mapped aviation context'
    })
  });
}

function runwayDesignator(yaw) {
  const heading = ((yaw * 180 / Math.PI) + 360) % 360;
  const number = Math.max(1, Math.min(36, Math.round(heading / 10) || 36));
  return String(number).padStart(2, '0');
}

function compileAirportOperationalLayout(graph, options = {}) {
  const aviation = Array.isArray(graph?.byDomain?.aviation) ? graph.byDomain.aviation : [];
  if (!aviation.length) return null;
  const runways = aviation.filter((record) => record.type === 'runway' && recordPoints(record).length >= 2);
  const terminals = aviation.filter((record) => record.type === 'terminal');
  const aprons = aviation.filter((record) => record.type === 'apron');
  const mappedStands = aviation.filter((record) => ['parking_position', 'gate'].includes(record.type));
  const aerodrome = aviation.find((record) => ['aerodrome', 'heliport'].includes(record.type));
  const centerRecord = terminals[0] || aprons[0] || aerodrome || runways[0] || aviation[0];
  const center = recordPoint(centerRecord);
  if (!center) return null;
  const mappedPrimary = [...runways].sort((left, right) => recordLength(right) - recordLength(left))[0] || null;
  const mappedLength = mappedPrimary ? recordLength(mappedPrimary) : 0;
  const mappedYaw = mappedPrimary ? recordYaw(mappedPrimary) : recordYaw(centerRecord);
  const locationLabel = String(options.location?.name || options.location?.city || '').toLowerCase();
  const large = mappedLength >= 900 || terminals.length > 0 || mappedStands.length >= 4 || /international|airport|airfield/.test(locationLabel);
  const fallbackLength = large ? 920 : 520;
  const fallbackWidth = large ? 46 : 32;
  const primaryRunway = mappedPrimary || generatedRunway(center, mappedYaw, fallbackLength, fallbackWidth);
  const yaw = recordYaw(primaryRunway);
  const length = Math.max(180, recordLength(primaryRunway));
  const width = Math.max(20, finite(primaryRunway.attributes?.width, large ? 46 : 32));
  const runwayPoints = recordPoints(primaryRunway);
  const runwayStart = runwayPoints[0];
  const runwayEnd = runwayPoints.at(-1);
  const standTarget = Math.max(
    options.mobile === true ? 7 : 14,
    Math.min(options.mobile === true ? 10 : 22, mappedStands.length + terminals.length * 4 + runways.length * 3)
  );
  const stands = mappedStands.map((record, index) => Object.freeze({
    id: record.id,
    ...recordPoint(record),
    yaw: recordYaw(record) || yaw,
    mapped: true,
    sourceType: record.type,
    index
  })).filter((stand) => [stand.x, stand.z].every(Number.isFinite));
  const standOrigin = recordPoint(aprons[0] || terminals[0]) || offsetPoint(center, yaw, width * 2.6, 0);
  for (let index = stands.length; index < standTarget; index += 1) {
    const row = Math.floor(index / 6);
    const column = index % 6;
    const side = row % 2 === 0 ? 1 : -1;
    const lateral = side * (width * 2.2 + row * 34);
    const forward = (column - 2.5) * (large ? 34 : 24);
    const point = offsetPoint(standOrigin, yaw, lateral, forward);
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
  const mappedTower = aviation.find((record) => record.type === 'control_tower');
  const towerPoint = recordPoint(mappedTower) || offsetPoint(center, yaw, -width * 3.5, -length * .12);
  const tower = Object.freeze({
    id: mappedTower?.id || 'generated-airport-layout:control-tower',
    ...towerPoint,
    mapped: !!mappedTower,
    generatedActivity: !mappedTower,
    height: large ? 34 : 22
  });
  const ticketPoint = recordPoint(terminals[0]) || offsetPoint(standOrigin, yaw, -width * 1.7, -length * .08);
  const ticketCounter = Object.freeze({
    id: terminals[0]?.id || 'generated-airport-layout:terminal',
    x: ticketPoint.x,
    z: ticketPoint.z,
    yaw,
    mapped: !!terminals[0],
    generatedActivity: !terminals[0],
    entrance: Object.freeze(offsetPoint(ticketPoint, yaw, 0, large ? 13 : 9))
  });
  return Object.freeze({
    type: 'AirportOperationalLayout',
    authority: 'compiled-airport-operational-layout',
    mobile: options.mobile === true,
    center: Object.freeze({ x: center.x, z: center.z }),
    large,
    yaw,
    runwayLength: length,
    runwayWidth: width,
    runwayDesignator: String(primaryRunway.attributes?.ref || '').trim() || runwayDesignator(yaw),
    primaryRunway,
    runways: Object.freeze(runways.length ? runways : [primaryRunway]),
    runwayStart: Object.freeze({ x: runwayStart.x, z: runwayStart.z }),
    runwayEnd: Object.freeze({ x: runwayEnd.x, z: runwayEnd.z }),
    stands: Object.freeze(stands),
    tower,
    ticketCounter,
    hasMappedTerminal: terminals.length > 0,
    mappedRunway: !!mappedPrimary,
    generatedFallback: !mappedPrimary,
    provenance: Object.freeze({
      mappedRecordCount: aviation.length,
      mappedStandCount: mappedStands.length,
      mappedRunwayCount: runways.length,
      generatedStandCount: stands.filter((stand) => !stand.mapped).length
    })
  });
}

export {
  compileAirportOperationalLayout,
  offsetPoint,
  recordLength,
  recordPoint,
  recordPoints,
  recordYaw,
  runwayDesignator
};

const REVIEWED_MAPPED_VESSELS = Object.freeze([
  Object.freeze({
    id: 'osm-way-83580877',
    sourceFeatureId: 'way/83580877',
    reviewedAt: '2026-08-29',
    center: Object.freeze({ lat: 39.28502, lon: -76.61178 }),
    tags: Object.freeze({
      building: 'ship', historic: 'ship', museum: 'maritime',
      name: 'USS Constellation', operator: 'Historic Ships of Baltimore',
      'ship:type': 'sloop_of_war', start_date: '1854', tourism: 'museum',
      website: 'https://historicships.org/explore/uss-constellation',
      wikidata: 'Q1571122', wikipedia: 'en:USS Constellation (1854)'
    }),
    footprint: Object.freeze([
      [39.2852580, -76.6118126], [39.2852432, -76.6118322],
      [39.2852253, -76.6118430], [39.2852057, -76.6118454],
      [39.2850157, -76.6118383], [39.2847951, -76.6118301],
      [39.2847801, -76.6118222], [39.2847681, -76.6118082],
      [39.2847605, -76.6117899], [39.2847582, -76.6117693],
      [39.2847615, -76.6117488], [39.2847699, -76.6117310],
      [39.2847825, -76.6117180], [39.2847978, -76.6117113],
      [39.2852084, -76.6117266], [39.2852287, -76.6117293],
      [39.2852467, -76.6117416], [39.2852599, -76.6117620],
      [39.2852984, -76.6117890], [39.2852580, -76.6118126]
    ].map(([lat, lon]) => Object.freeze({ lat, lon })))
  })
]);

function reviewedMappedVesselDataNear(location = {}, radiusDegrees = .022) {
  const lat = Number(location.lat);
  const lon = Number(location.lon);
  if (![lat, lon].every(Number.isFinite)) return null;
  const radius = Math.max(.001, Number(radiusDegrees) || .022);
  const records = REVIEWED_MAPPED_VESSELS.filter((entry) =>
    Math.abs(entry.center.lat - lat) <= radius && Math.abs(entry.center.lon - lon) <= radius
  );
  if (!records.length) return null;
  const elements = [];
  records.forEach((entry, recordIndex) => {
    const wayId = -9100000 - recordIndex;
    const nodeIds = entry.footprint.map((point, pointIndex) => {
      const nodeId = wayId * 100 - pointIndex - 1;
      elements.push({ type: 'node', id: nodeId, lat: point.lat, lon: point.lon });
      return nodeId;
    });
    elements.push({
      type: 'way', id: wayId, nodes: nodeIds,
      tags: {
        ...entry.tags,
        _sourceFeatureId: entry.sourceFeatureId,
        _geometrySource: 'reviewed-openstreetmap-snapshot',
        _reviewedAt: entry.reviewedAt,
        _provider: 'OpenStreetMap',
        _license: 'ODbL-1.0'
      }
    });
  });
  return Object.freeze({
    elements,
    _overpassSource: 'reviewed-openstreetmap-snapshot',
    _reviewedMappedVesselCount: records.length
  });
}

export { REVIEWED_MAPPED_VESSELS, reviewedMappedVesselDataNear };

import { CERN_SITE_REFERENCE } from '../interiors/cern-site-reference.js';
import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';

export const CERN_STATIONS = Object.freeze({
  'cern-science-gateway': Object.freeze({
    orientation: { x: 0, z: 9, level: 0, label: 'Visit orientation' },
    bend: { x: -7, z: 0, level: 0, label: 'Beam steering' },
    rf: { x: -7, z: -10, level: 0, label: 'RF phase' },
    focus: { x: -7, z: -21, level: 0, label: 'Quadrupole focusing' },
  }),
  'cms-point-five': Object.freeze({
    signals: { x: -7, z: -16, level: 0, label: 'Detector readouts' },
    track: { x: -7, z: 23, level: 0, label: 'Select and fit hits' },
    mass: { x: 0, z: 23, level: 0, label: 'Recorded pair and observer' },
    population: { x: 7, z: 23, level: 0, label: 'Charge-selection comparison' },
  }),
});
export const CERN_ARRIVALS = Object.freeze({
  'cern-science-gateway': {
    id: 'cern-science-gateway',
    name: 'CERN · Meyrin reception',
    lat: 46.23353415849373,
    lon: 6.056988453434153,
    environment: 'earth',
  },
  'cms-point-five': {
    id: 'cms-point-five',
    name: 'CMS · Point 5 surface entrance',
    lat: 46.30964505736434,
    lon: 6.0773132221366835,
    environment: 'earth',
  },
});
export function cernCoordinateFrame(site, geoToWorld, metersPerUnit = 1) {
  const reference = site.footprint.map((p) => geoToWorld(p.lat, p.lon)),
    center = reference.reduce(
      (c, p) => ({ x: c.x + p.x / reference.length, z: c.z + p.z / reference.length }),
      { x: 0, z: 0 }
    );
  let length = 0,
    ux = 0,
    uz = 1;
  for (let i = 0; i < reference.length; i++) {
    const a = reference[i],
      b = reference[(i + 1) % reference.length],
      d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d > length) {
      length = d;
      ux = (b.x - a.x) / d;
      uz = (b.z - a.z) / d;
    }
  }
  return {
    center,
    yaw: Math.atan2(ux, uz),
    local: (p) => ({
      x: ((p.x - center.x) * uz - (p.z - center.z) * ux) * metersPerUnit,
      z: ((p.x - center.x) * ux + (p.z - center.z) * uz) * metersPerUnit,
    }),
    world: (p) => ({
      x: center.x + (p.x * uz + p.z * ux) / metersPerUnit,
      z: center.z + (-p.x * ux + p.z * uz) / metersPerUnit,
    }),
  };
}
export function acceleratorTargetSite(method) {
  return ['orientation', 'bend', 'rf', 'focus'].includes(method)
    ? 'cern-science-gateway'
    : 'cms-point-five';
}
export function cernStationReference(method) {
  const siteId = acceleratorTargetSite(method),
    source = CERN_SITE_REFERENCE.find((s) => s.id === siteId),
    station = CERN_STATIONS[siteId][method],
    frame = earthCoordinateFrame(source.footprint[0], 111000),
    metric = cernCoordinateFrame(source, (lat, lon) => frame.toWorld(lat, lon)),
    p = metric.world(station);
  return {
    siteId,
    source,
    station,
    position: frame.toGeographic(p.x, p.z),
    floorId: siteId === 'cms-point-five' ? 'cms-cavern' : 'meyrin-training',
  };
}

// Two-site notebooks retain their physical method evidence separately from
// the outside arrival used by ordinary Travel. This also reads early notebooks
// whose generic Journal location still pointed to the first campus.
export function cernNotebookReturn(event) {
  const m = event?.metadata,
    e = m?.action?.evidence,
    r = m?.acceleratorReport;
  if (
    event?.sourceSystem !== 'research-careers' ||
    m?.careerId !== 'accelerator' ||
    m.action?.type !== 'publish' ||
    r?.schemaVersion !== 1 ||
    r.truthType !== 'collision-lab-reproducible-study' ||
    e?.siteId !== 'cms-point-five' ||
    e.floorId !== 'cms-cavern' ||
    e.supported !== true
  )
    return null;
  const source = CERN_SITE_REFERENCE.find((s) => s.id === e.siteId);
  if (![source.sourceBuildingId, ...source.sourceAliases].includes(e.sourceBuildingId)) return null;
  const place = CERN_ARRIVALS[e.siteId];
  return {
    kind: 'earth-coordinate',
    location: { lat: place.lat, lon: place.lon, name: place.name },
    label: 'Return to CMS visit',
  };
}

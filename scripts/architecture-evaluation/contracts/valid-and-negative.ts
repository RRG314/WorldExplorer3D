import { requestLocation, type GeographicLocation, type LocalPosition, type ProvenanceValue } from './world-boundary.js';

const request = requestLocation({ key: 'custom', name: 'Baltimore', lat: 39.2904, lon: -76.6122 }, 1);
if (request) {
  const latitude: number = request.location.lat;
  void latitude;
  // @ts-expect-error Published request coordinates are immutable.
  request.location.lat = 0;
}
// @ts-expect-error Existing validator can reject a request. Callers must handle null.
request.location.lat;
// @ts-expect-error Boundary accepts numeric coordinates, not form-control strings.
requestLocation({ key: 'custom', name: 'Baltimore', lat: '39.29', lon: -76.61 }, 1);
// @ts-expect-error Existing sequence contract is numeric, not a string token.
requestLocation({ key: 'custom', name: 'Baltimore', lat: 39.29, lon: -76.61 }, '1');
const local: LocalPosition = { frame: 'earth-local', x: 4, y: 2, z: 3 };
// @ts-expect-error A renderer/local position is not a latitude/longitude pair.
const location: GeographicLocation = local;
// @ts-expect-error Inferred provenance requires an inference method.
const field: ProvenanceValue<number> = { status: 'inferred', value: 12, sourceFeatureId: 'osm:way:1' };
void location;void field;

import { requestLocation, type GeographicLocation, type LocalPosition, type ProvenanceValue } from '../types/world-boundaries.js';

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

import { limitNodesByDistance } from '../app/js/earth-core/location-selection.js';
import { sampleSortedProfileAtDistance } from '../app/js/structure-semantics/profile-sampling.js';
limitNodesByDistance([{lat:39,lon:-76}],1,{lat:39,lon:-76});
// @ts-expect-error Geographic selection cannot consume local X/Z coordinates.
limitNodesByDistance([{x:1,z:2}],1,{lat:39,lon:-76});
// @ts-expect-error Numeric profile query cannot use a form-control string.
sampleSortedProfileAtDistance(new Float64Array([0,1]),new Float32Array([0,1]),'0.5');

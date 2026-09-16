// Geometry guards can discard source points. Only retained source nodes may
// define the published graph; interpolated vertices never acquire source IDs.
export function publishedRoadSourceTopology(records, sourcePoints, publishedPoints) {
  const key = point => `${point.x}:${point.z}`;
  const retained = new Set(publishedPoints.map(key));
  return Object.freeze(records.flatMap((record, index) => {
    const point = sourcePoints[index];
    return point && retained.has(key(point))
      ? [Object.freeze({id:String(record.id),x:point.x,z:point.z})] : [];
  }));
}

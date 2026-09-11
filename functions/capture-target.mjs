// Physical Earth contributions do not belong to the coordinate used to start
// exploring. Other world/session namespaces remain exact and isolated.
export function captureWorldScope(value) {
  const id=String(value||'');
  return /^earth:v1:-?\d+:-?\d+$/.test(id)||id==='earth:physical:v1'?'earth:physical:v1':id;
}
export function sameCaptureWorld(a,b) {return !!a&&!!b&&captureWorldScope(a)===captureWorldScope(b);}
export function sameCaptureBuilding(a={},b={}) {
  return !!a.sourceBuildingId&&a.sourceBuildingId===b.sourceBuildingId&&sameCaptureWorld(a.worldId,b.worldId);
}
export function captureBuildingKey(building={}) {return JSON.stringify([captureWorldScope(building.worldId),building.sourceBuildingId]);}

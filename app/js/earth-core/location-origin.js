import {earthCoordinateFrame} from './coordinate-frame.js?v=1';
// Commit the coordinate origin only when an environment transition/load accepts
// a location. Editing a search selection must not move the active world frame.
export function commitEarthLocationOrigin(appCtx, location) {
  if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lon) || Math.abs(location.lat)>90 || Math.abs(location.lon)>180) throw new TypeError('A world origin requires valid geographic coordinates.');
  appCtx.LOC = {...location};
  return appCtx.LOC;
}

export function earthLocalToGeographic(origin, scale, x, z) {
  if (![origin?.lat,origin?.lon,scale,x,z].every(Number.isFinite) || scale<=0 || Math.abs(origin.lat)>90 || Math.abs(origin.lon)>180) return {lat:null,lon:null};
  return earthCoordinateFrame(origin,scale).toGeographic(x,z);
}

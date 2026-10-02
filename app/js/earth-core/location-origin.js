// Commit the coordinate origin only when an environment transition/load accepts
// a location. Editing a search selection must not move the active world frame.
export function commitEarthLocationOrigin(appCtx, location) {
  if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lon) || Math.abs(location.lat)>90 || Math.abs(location.lon)>180) throw new TypeError('A world origin requires valid geographic coordinates.');
  appCtx.LOC = {...location};
  return appCtx.LOC;
}

export function earthLocalToGeographic(origin, scale, x, z) {
  if (![origin?.lat,origin?.lon,scale,x,z].every(Number.isFinite) || scale<=0) return {lat:null,lon:null};
  const lat=origin.lat-z/scale;
  const longitudeScale=scale*Math.cos(origin.lat*Math.PI/180);
  if (Math.abs(lat)>90 || Math.abs(longitudeScale)<1e-6) return {lat:null,lon:null};
  const lon=origin.lon+x/longitudeScale;
  return {lat,lon:((lon+180)%360+360)%360-180};
}

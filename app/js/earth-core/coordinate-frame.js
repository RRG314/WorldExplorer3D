import {createLocalEnuFrame,geographicToLocalEnu,localEnuToGeographic} from '../terrain/source-contract.js?v=2';

// One reversible local-frame convention for Earth consumers. This preserves
// current district coordinates; it does not itself stream cells or rebase actors.
const frames = new Map();
let lastFrame = null;
const FRAME_LIMIT = 16;
const wrapLongitude = value => value >= -180 && value < 180 ? value : ((value + 180) % 360 + 360) % 360 - 180;

export function earthCoordinateFrame(origin, scale) {
  const lat = Number(origin?.lat), lon = Number(origin?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(scale) || Math.abs(lat)>90 || Math.abs(lon)>180 || scale<=0) {
    throw new TypeError('An Earth frame requires valid WGS84 coordinates and a positive scale.');
  }
  // Coordinate conversion is a hot path (terrain and minimap vertices). The
  // usual active frame needs no cache-key string or LRU mutation per point.
  if (lastFrame?.origin.lat===lat && lastFrame.origin.lon===lon && lastFrame.scale===scale) return lastFrame;
  const key = `${lat}:${lon}:${scale}`;
  if (frames.has(key)) {
    const frame = frames.get(key); frames.delete(key); frames.set(key,frame); lastFrame=frame; return frame;
  }
  const polar = Math.abs(lat)>=84;
  const enu = polar ? createLocalEnuFrame({latitude:lat,longitude:lon}) : null;
  const unitsPerMeter = scale / 111000;
  const longitudeScale = scale * Math.cos(lat*Math.PI/180);
  const frame = Object.freeze({
    origin: Object.freeze({lat,lon}), scale, projection: polar ? 'local-enu' : 'local-equirectangular',
    toWorld(latitude,longitude,result={}) {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) {
        result.x=null;result.z=null;return result;
      }
      if (polar) {
        const local=geographicToLocalEnu(enu,{latitude,longitude,heightMeters:0});
        result.x=local.eastMeters*unitsPerMeter;result.z=-local.northMeters*unitsPerMeter;
      } else {
        result.x=wrapLongitude(longitude-lon)*longitudeScale;result.z=-(latitude-lat)*scale;
      }
      return result;
    },
    toGeographic(x,z,result={}) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) {result.lat=null;result.lon=null;return result;}
      if (polar) {
        const geographic=localEnuToGeographic(enu,{eastMeters:x/unitsPerMeter,northMeters:-z/unitsPerMeter,upMeters:0});
        result.lat=geographic.latitude;result.lon=wrapLongitude(geographic.longitude);
      } else {
        const latitude=lat-z/scale;
        result.lat=Math.abs(latitude)<=90?latitude:null;
        result.lon=result.lat===null?null:wrapLongitude(lon+x/longitudeScale);
      }
      return result;
    }
  });
  frames.set(key,frame);
  lastFrame=frame;
  while(frames.size>FRAME_LIMIT)frames.delete(frames.keys().next().value);
  return frame;
}

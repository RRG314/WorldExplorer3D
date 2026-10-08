// Public scientific models -> the application's existing metric weather contract.
// Numerical forecasts are guidance, never station observations or diving advice.
const HOUR = 3600000;
const NOAA_WAVE_FIELDS = Object.freeze({
  Significant_height_of_combined_wind_waves_and_swell_surface:['wave_height','m',40],
  Primary_wave_direction_surface:['wave_direction','degree_true',360],
  Primary_wave_mean_period_surface:['wave_period','s',100],
  Significant_height_of_wind_waves_surface:['wind_wave_height','m',40]
});
const finite = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const range = (value, min, max) => { const n = finite(value); return n != null && n >= min && n <= max ? n : null; };
const wrapLon = lon => ((lon + 180) % 360 + 360) % 360 - 180;
const isoHour = now => new Date(Math.floor(now / HOUR) * HOUR).toISOString().replace('.000', '');
function coordinate(value, max) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') throw Object.assign(new Error('Valid coordinates are required.'), {statusCode: 400});
  const number = range(value, -max, max);
  if (number == null) throw Object.assign(new Error('Valid coordinates are required.'), {statusCode: 400});
  return number;
}
function normalizeRequest(input = {}) {
  if (!['weather', 'marine'].includes(input.kind)) throw Object.assign(new Error('Unknown environmental request.'), {statusCode: 400});
  const lats = String(input.latitude ?? '').split(','), lons = String(input.longitude ?? '').split(',');
  if (!lats.length || lats.length !== lons.length || lats.length > (input.kind === 'marine' ? 1 : 16)) throw Object.assign(new Error('Invalid location batch.'), {statusCode: 400});
  return {kind: input.kind, locations: lats.map((lat, index) => ({lat: coordinate(lat, 90), lon: coordinate(lons[index], 180)}))};
}
function modelRequest(provider, location, now) {
  const hour = isoHour(now);
  if (provider === 'met-norway') {
    const lat = Number(location.lat.toFixed(2)), lon = Number(location.lon.toFixed(2));
    return {provider, lat, lon, url: `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`, intervalMs: 300};
  }
  if (provider === 'pacioos-ww3') {
    if (Math.abs(location.lat) > 77.5) return null;
    const lat = Math.round(location.lat * 2) / 2, lon = ((Math.round(location.lon * 2) / 2) % 360 + 360) % 360;
    const dims = `[(${hour})][(0)][(${lat})][(${lon})]`;
    const fields = ['Thgt', 'Tdir', 'Tper', 'whgt', 'shgt', 'sdir', 'sper'];
    return {provider, lat, lon: wrapLon(lon), url: 'https://pae-paha.pacioos.hawaii.edu/erddap/griddap/ww3_global.json?' + fields.map(v => v + dims).join(','), intervalMs: 500};
  }
  if (provider === 'noaa-ww3') {
    if (location.lat < -77.5) return null;
    const lat = Math.round(location.lat * 2) / 2, lon = ((Math.round(location.lon * 2) / 2) % 360 + 360) % 360;
    const url = new URL('https://tds.scigw.unidata.ucar.edu/thredds/ncss/grid/grib/NCEP/WW3/Global/Best');
    for (const field of Object.keys(NOAA_WAVE_FIELDS)) url.searchParams.append('var',field);
    Object.entries({latitude:lat,longitude:lon,time:hour,accept:'xml'}).forEach(([k,v])=>url.searchParams.set(k,v));
    return {provider,lat,lon:wrapLon(lon),url:url.href,intervalMs:1000};
  }
  if (provider === 'hycom-espc') {
    if (location.lat < -80) return null;
    const lat = Number((Math.round(location.lat / 0.04) * 0.04).toFixed(4));
    const lon = Number((((Math.round(((location.lon + 360) % 360) / 0.08) * 0.08) % 360)).toFixed(4));
    const url = new URL('https://ncss.hycom.org/thredds/ncss/grid/GLBy0.08/latest');
    Object.entries({var: 'ssu,ssv,sst', latitude: lat, longitude: lon, time: hour, accept: 'csv'}).forEach(([k,v]) => url.searchParams.set(k,v));
    return {provider, lat, lon: wrapLon(lon), url: url.href, intervalMs: 1000};
  }
  throw new Error('Unknown model provider.');
}
function wmoCode(symbol = '') {
  const key = String(symbol).replace(/_(day|night|polartwilight)$/, '');
  if (key.includes('thunder')) return 95;
  const simple = {clearsky:0, fair:1, partlycloudy:2, cloudy:3, fog:45,
    lightrain:61, rain:63, heavyrain:65, lightrainshowers:80, rainshowers:80, heavyrainshowers:81,
    lightsnow:71, snow:73, heavysnow:75, lightsnowshowers:85, snowshowers:85, heavysnowshowers:86};
  // WMO 68/69 describe rain-and-snow mixtures; preserve sleet instead of claiming freezing rain.
  if (key.includes('sleet')) return key.startsWith('heavy') ? 69 : 68;
  return simple[key] ?? null;
}
function normalizeWeather(raw, request, now = Date.now()) {
  const series = raw?.properties?.timeseries;
  if (!Array.isArray(series)) throw new Error('Weather model response is invalid.');
  const entry = series.filter(row => Number.isFinite(Date.parse(row.time)) && Date.parse(row.time) <= now)
    .sort((a,b) => Date.parse(b.time) - Date.parse(a.time))[0];
  if (!entry || now - Date.parse(entry.time) > 3 * HOUR) throw new Error('Weather model has no current forecast.');
  const instant = entry.data?.instant?.details || {}, period = entry.data?.next_1_hours;
  const symbol = period?.summary?.symbol_code || entry.data?.next_6_hours?.summary?.symbol_code || '';
  const speed = range(instant.wind_speed, 0, 150), precipitation = range(period?.details?.precipitation_amount, 0, 1000);
  return {latitude: request.lat, longitude: request.lon, timezone: 'UTC', timezone_abbreviation: 'UTC', sourceId: 'met-norway',
    issuedAt: raw.properties?.meta?.updated_at || '', fetchedAt: new Date(now).toISOString(),
    current: {time: entry.time, temperature_2m: range(instant.air_temperature, -100, 70), relative_humidity_2m: range(instant.relative_humidity, 0, 100),
      apparent_temperature: null, is_day: symbol.endsWith('_day') ? 1 : symbol.endsWith('_night') ? 0 : null,
      weather_code: wmoCode(symbol), cloud_cover: range(instant.cloud_area_fraction, 0, 100),
      wind_speed_10m: speed == null ? null : speed * 3.6, wind_direction_10m: range(instant.wind_from_direction, 0, 360),
      precipitation, rain: /rain/.test(symbol) && !/sleet|snow/.test(symbol) ? precipitation : null,
      showers: null, snowfall: null, visibility: null},
    current_units: {temperature_2m:'°C', wind_speed_10m:'km/h', wind_direction_10m:'°', precipitation:'mm'},
    transformations: 'MET Norway hourly forecast; wind converted m/s to km/h; symbols mapped to WMO categories. Unprovided fields remain unavailable.'};
}
function validateTime(time, now) {
  const at = Date.parse(time);
  if (!Number.isFinite(at) || Math.abs(now - at) > 2 * HOUR) throw new Error('Marine forecast time is outside the current window.');
  return new Date(at).toISOString();
}
function normalizeWaves(raw, request, now = Date.now()) {
  const table = raw?.table;
  if (!Array.isArray(table?.columnNames) || table?.rows?.length !== 1) throw new Error('Wave model response is invalid.');
  const row = Object.fromEntries(table.columnNames.map((key, i) => [key, table.rows[0][i]]));
  const units = Object.fromEntries(table.columnNames.map((key,i) => [key,table.columnUnits?.[i]]));
  for (const [key, unit] of [['Thgt','meters'],['Tdir','degrees'],['Tper','second'],['whgt','meters'],['shgt','meters'],['sdir','degrees'],['sper','seconds']]) {
    if (units[key] !== unit) throw new Error('Wave model units changed.');
  }
  const latitude = range(row.latitude,-90,90), longitude = finite(row.longitude);
  if (latitude == null || longitude == null || Math.abs(latitude-request.lat)>0.01 || Math.abs(wrapLon(longitude-request.lon))>0.01) throw new Error('Wave grid differs from request.');
  return {sourceId:'pacioos-ww3', latitude, longitude:wrapLon(longitude), validAt:validateTime(row.time,now),
    fields: {wave_height:range(row.Thgt,0,40), wave_direction:range(row.Tdir,0,360), wave_period:range(row.Tper,0,100),
      wind_wave_height:range(row.whgt,0,40), swell_wave_height:range(row.shgt,0,40), swell_wave_direction:range(row.sdir,0,360), swell_wave_period:range(row.sper,0,100)}};
}
function normalizeCurrents(csv, request, now = Date.now()) {
  const rows = String(csv).trim().split(/\r?\n/);
  if (rows.length !== 2) throw new Error('Ocean model response is invalid.');
  const names = rows[0].split(','), values = rows[1].split(','), row = Object.fromEntries(names.map((key,i)=>[key,values[i]]));
  for (const key of ['time','latitude[unit="degrees_north"]','longitude[unit="degrees_east"]','ssu[unit="m/s"]','ssv[unit="m/s"]','sst[unit="degC"]']) {
    if (!(key in row)) throw new Error('Ocean model fields or units changed.');
  }
  const latitude = finite(row['latitude[unit="degrees_north"]']), longitude = finite(row['longitude[unit="degrees_east"]']);
  if (latitude == null || longitude == null || Math.abs(latitude-request.lat)>0.01 || Math.abs(wrapLon(longitude-request.lon))>0.01) throw new Error('Ocean grid differs from request.');
  const u=range(row['ssu[unit="m/s"]'],-15,15), v=range(row['ssv[unit="m/s"]'],-15,15);
  const speed=u==null||v==null?null:Math.hypot(u,v);
  return {sourceId:'hycom-espc',latitude,longitude:wrapLon(longitude),validAt:validateTime(row.time,now),fields:{
    ocean_current_velocity:speed==null?null:speed*3.6,
    ocean_current_direction:speed==null||speed<0.000001?null:(Math.atan2(u,v)*180/Math.PI+360)%360,
    sea_surface_temperature:range(row['sst[unit="degC"]'],-5,50)}};
}
function normalizeNoaaWaves(xml, request, now = Date.now()) {
  const text=String(xml);
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || (text.match(/<stationFeature\s/g)||[]).length!==1) throw new Error('NOAA wave model response is invalid.');
  const date=text.match(/<stationFeature\s+date="([^"]+)"/)?.[1];
  const station=text.match(/<station\s[^>]*>/)?.[0] || '';
  const latitude=finite(station.match(/latitude="([^"]+)"/)?.[1]), longitude=finite(station.match(/longitude="([^"]+)"/)?.[1]);
  if(latitude==null||longitude==null||Math.abs(latitude-request.lat)>.01||Math.abs(wrapLon(longitude-request.lon))>.01)throw new Error('NOAA wave grid differs from request.');
  const values=new Map([...text.matchAll(/<data name="([^"]+)" units="([^"]+)">([^<]+)<\/data>/g)].map(m=>[m[1],{units:m[2],value:m[3]}]));
  const fields={};
  for(const [name,[field,unit,max]] of Object.entries(NOAA_WAVE_FIELDS)){
    const value=values.get(name);if(value?.units!==unit)throw new Error('NOAA wave fields or units changed.');
    fields[field]=range(value.value,0,max);
  }
  return {sourceId:'noaa-ww3',latitude,longitude:wrapLon(longitude),validAt:validateTime(date,now),fields};
}
function combineMarine(parts, location, warnings = []) {
  const sources=parts.filter(Boolean), first=sources[0];
  return {sourceId:'public-marine', latitude:first?.latitude??null, longitude:first?.longitude??null,
    requested:location, current:{time:first?.validAt||'',...Object.assign({},...sources.map(s=>s.fields))},
    sources:sources.map(({fields,...source})=>({...source,fields:Object.keys(fields)})), warnings};
}
module.exports={normalizeRequest,modelRequest,normalizeWeather,normalizeWaves,normalizeCurrents,normalizeNoaaWaves,combineMarine,wmoCode};

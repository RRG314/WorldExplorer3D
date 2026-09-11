const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;
const SOLAR_DISTANCE_KM = 149598000;

function toJulian(date) {
  return date.valueOf() / DAY_MS - 0.5 + J1970;
}

function toDays(date) {
  return toJulian(date) - J2000;
}

function rightAscension(l, b) {
  return Math.atan2(
    Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY),
    Math.cos(l)
  );
}

function declination(l, b) {
  return Math.asin(
    Math.sin(b) * Math.cos(OBLIQUITY) +
    Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l)
  );
}

function azimuth(hourAngle, latitude, dec) {
  return Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(dec) * Math.cos(latitude)
  );
}

function altitude(hourAngle, latitude, dec) {
  return Math.asin(
    Math.sin(latitude) * Math.sin(dec) +
    Math.cos(latitude) * Math.cos(dec) * Math.cos(hourAngle)
  );
}

function siderealTime(days, lw) {
  return RAD * (280.16 + 360.9856235 * days) - lw;
}

function solarMeanAnomaly(days) {
  return RAD * (357.5291 + 0.98560028 * days);
}

function eclipticLongitude(meanAnomaly) {
  const center = RAD * (
    1.9148 * Math.sin(meanAnomaly) +
    0.02 * Math.sin(2 * meanAnomaly) +
    0.0003 * Math.sin(3 * meanAnomaly)
  );
  const perihelion = RAD * 102.9372;
  return meanAnomaly + center + perihelion + Math.PI;
}

function sunCoords(days) {
  const meanAnomaly = solarMeanAnomaly(days);
  const lambda = eclipticLongitude(meanAnomaly);
  return {
    meanAnomaly,
    lambda,
    dec: declination(lambda, 0),
    ra: rightAscension(lambda, 0)
  };
}

function getSunPosition(date, lat, lon) {
  const lw = -lon * RAD;
  const phi = lat * RAD;
  const days = toDays(date);
  const coords = sunCoords(days);
  const st = siderealTime(days, lw);
  const hourAngle = st - coords.ra;
  return {
    azimuth: azimuth(hourAngle, phi, coords.dec),
    altitude: altitude(hourAngle, phi, coords.dec),
    rightAscension: coords.ra,
    declination: coords.dec,
    siderealTime: st,
    hourAngle
  };
}

function moonCoords(days) {
  const longitude = RAD * (218.316 + 13.176396 * days);
  const meanAnomaly = RAD * (134.963 + 13.064993 * days);
  const meanDistance = RAD * (93.272 + 13.22935 * days);
  const lambda = longitude + RAD * 6.289 * Math.sin(meanAnomaly);
  const beta = RAD * 5.128 * Math.sin(meanDistance);
  const distanceKm = 385001 - 20905 * Math.cos(meanAnomaly);
  return {
    lambda,
    beta,
    distanceKm,
    ra: rightAscension(lambda, beta),
    dec: declination(lambda, beta)
  };
}

function astroRefraction(altitudeRad) {
  const safeAltitude = altitudeRad < 0 ? 0 : altitudeRad;
  return 0.0002967 / Math.tan(safeAltitude + 0.00312536 / (safeAltitude + 0.08901179));
}

function getMoonPosition(date, lat, lon) {
  const lw = -lon * RAD;
  const phi = lat * RAD;
  const days = toDays(date);
  const coords = moonCoords(days);
  const st = siderealTime(days, lw);
  const hourAngle = st - coords.ra;
  const baseAltitude = altitude(hourAngle, phi, coords.dec);
  return {
    azimuth: azimuth(hourAngle, phi, coords.dec),
    altitude: baseAltitude + astroRefraction(baseAltitude),
    rightAscension: coords.ra,
    declination: coords.dec,
    distanceKm: coords.distanceKm,
    parallacticAngle: Math.atan2(
      Math.sin(hourAngle),
      Math.tan(phi) * Math.cos(coords.dec) - Math.sin(coords.dec) * Math.cos(hourAngle)
    )
  };
}

function getMoonIllumination(date) {
  const days = toDays(date);
  const sun = sunCoords(days);
  const moon = moonCoords(days);
  const phaseAngle = Math.acos(
    Math.sin(sun.dec) * Math.sin(moon.dec) +
    Math.cos(sun.dec) * Math.cos(moon.dec) * Math.cos(sun.ra - moon.ra)
  );
  const incidence = Math.atan2(
    SOLAR_DISTANCE_KM * Math.sin(phaseAngle),
    moon.distanceKm - SOLAR_DISTANCE_KM * Math.cos(phaseAngle)
  );
  const signedAngle = Math.atan2(
    Math.cos(sun.dec) * Math.sin(sun.ra - moon.ra),
    Math.sin(sun.dec) * Math.cos(moon.dec) -
    Math.cos(sun.dec) * Math.sin(moon.dec) * Math.cos(sun.ra - moon.ra)
  );
  return {
    fraction: (1 + Math.cos(incidence)) * 0.5,
    phase: 0.5 + 0.5 * incidence * (signedAngle < 0 ? -1 : 1) / Math.PI,
    signedAngle,
    incidence
  };
}

function clamp01(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

function normalizeAngle(rad) {
  const twoPi = Math.PI * 2;
  let value = rad % twoPi;
  if (value < 0) value += twoPi;
  return value;
}

export {
  clamp01,
  getMoonIllumination,
  getMoonPosition,
  getSunPosition,
  normalizeAngle,
  radToDeg,
  siderealTime,
  smoothstep,
  toDays
};

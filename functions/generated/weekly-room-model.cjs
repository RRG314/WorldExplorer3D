'use strict';
// Generated from canonical weekly room facts. Run node scripts/build-weekly-room-model.mjs after changing those facts.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// app/js/multiplayer/featured-city-model.js
var featured_city_model_exports = {};
__export(featured_city_model_exports, {
  WEEKLY_CITY_ROTATION: () => WEEKLY_CITY_ROTATION,
  getWeeklyEventMessage: () => getWeeklyEventMessage,
  getWeeklyFeaturedCity: () => getWeeklyFeaturedCity,
  isoWeekNumber: () => isoWeekNumber,
  normalizeFeaturedCityKey: () => normalizeFeaturedCityKey,
  weeklyRoomCode: () => weeklyRoomCode,
  weeklyRoomDescriptor: () => weeklyRoomDescriptor
});
module.exports = __toCommonJS(featured_city_model_exports);

// app/js/earth-core/location-catalog.js
var LOCS = {
  baltimore: { name: "Baltimore", lat: 39.2904, lon: -76.6122, countryCode: "US" },
  hollywood: { name: "Hollywood", lat: 34.0928, lon: -118.3287, countryCode: "US" },
  newyork: { name: "New York", lat: 40.758, lon: -73.9855, countryCode: "US" },
  miami: { name: "Miami", lat: 25.7617, lon: -80.1918, countryCode: "US" },
  tokyo: { name: "Tokyo", lat: 35.6762, lon: 139.6503, countryCode: "JP" },
  monaco: { name: "Monaco", lat: 43.7384, lon: 7.4246, countryCode: "MC" },
  nurburgring: { name: "N\xFCrburgring", lat: 50.3356, lon: 6.9475, countryCode: "DE" },
  lasvegas: { name: "Las Vegas", lat: 36.1699, lon: -115.1398, countryCode: "US" },
  london: { name: "London", lat: 51.5074, lon: -0.1278, countryCode: "GB" },
  paris: { name: "Paris", lat: 48.8566, lon: 2.3522, countryCode: "FR" },
  dubai: { name: "Dubai", lat: 25.2048, lon: 55.2708, countryCode: "AE" },
  sanfrancisco: { name: "San Francisco", lat: 37.7749, lon: -122.4194, countryCode: "US" },
  losangeles: { name: "Los Angeles", lat: 34.0522, lon: -118.2437, countryCode: "US" },
  chicago: { name: "Chicago", lat: 41.8781, lon: -87.6298, countryCode: "US" },
  seattle: { name: "Seattle", lat: 47.6062, lon: -122.3321, countryCode: "US" },
  kennedy: { name: "Kennedy Space Center \xB7 VAB", lat: 28.58684, lon: -80.65121, countryCode: "US" },
  kennedy39b: { name: "Kennedy Space Center \xB7 Launch Pad 39B", lat: 28.62374, lon: -80.62082, countryCode: "US" }
};

// app/js/multiplayer/featured-city-model.js
var WEEKLY_CITY_ROTATION = Object.freeze([
  { city: "Tokyo", kind: "earth" },
  { city: "Paris", kind: "earth" },
  { city: "Baltimore", kind: "earth" },
  { city: "Monaco", kind: "earth" },
  { city: "New York", kind: "earth" },
  { city: "Miami", kind: "earth" },
  { city: "London", kind: "earth" },
  { city: "Dubai", kind: "earth" },
  { city: "San Francisco", kind: "earth" },
  { city: "Los Angeles", kind: "earth" },
  { city: "Chicago", kind: "earth" },
  { city: "Seattle", kind: "earth" },
  { city: "Hollywood", kind: "earth" },
  { city: "N\xFCrburgring", kind: "earth" },
  { city: "Las Vegas", kind: "earth" }
]);
function normalizeFeaturedCityKey(input) {
  return String(input || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
function isoWeekNumber(date = /* @__PURE__ */ new Date()) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil(((value - yearStart) / 864e5 + 1) / 7);
}
function getWeeklyFeaturedCity(date = /* @__PURE__ */ new Date()) {
  const week = isoWeekNumber(date);
  const selected = WEEKLY_CITY_ROTATION[week % WEEKLY_CITY_ROTATION.length];
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear(), cityKey = normalizeFeaturedCityKey(selected.city);
  const location = Object.values(LOCS).find((place) => normalizeFeaturedCityKey(place.name) === cityKey);
  if (!location) throw new Error("Weekly city has no canonical location.");
  return { week, year, weekKey: `${year}-W${String(week).padStart(2, "0")}`, city: selected.city, kind: selected.kind, cityKey, lat: location.lat, lon: location.lon };
}
function getWeeklyEventMessage(date = /* @__PURE__ */ new Date()) {
  const featured = getWeeklyFeaturedCity(date);
  const fridayPush = date.getUTCDay() === 5 ? `Explore ${featured.city} with others today.` : `Explore ${featured.city} with others this Friday.`;
  return { featured, message: fridayPush };
}
function weeklyRoomCode(selection) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = selection.year * 64 + selection.week, code = "W";
  for (let i = 0; i < 5; i++) {
    code += alphabet[value % alphabet.length];
    value = Math.floor(value / alphabet.length);
  }
  return code;
}
function weeklyRoomDescriptor(date = /* @__PURE__ */ new Date()) {
  const weekly = getWeeklyFeaturedCity(date);
  return { ...weekly, code: weeklyRoomCode(weekly), world: { kind: "earth", lat: weekly.lat, lon: weekly.lon, seed: `latlon:${weekly.lat.toFixed(5)},${weekly.lon.toFixed(5)}` } };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WEEKLY_CITY_ROTATION,
  getWeeklyEventMessage,
  getWeeklyFeaturedCity,
  isoWeekNumber,
  normalizeFeaturedCityKey,
  weeklyRoomCode,
  weeklyRoomDescriptor
});

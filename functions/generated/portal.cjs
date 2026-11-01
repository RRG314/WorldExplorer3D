'use strict';
// Generated from app/js/portal. Run node scripts/build-shared-portal.mjs after changing the shared model/catalog.
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

// <stdin>
var stdin_exports = {};
__export(stdin_exports, {
  PORTAL_CATALOG: () => PORTAL_CATALOG,
  PORTAL_NATIVE_CLIENTS: () => PORTAL_NATIVE_CLIENTS,
  PORTAL_RENDER_CONTRACT: () => PORTAL_RENDER_CONTRACT,
  PORTAL_TRAIL_VERSION: () => PORTAL_TRAIL_VERSION,
  acceptPortalSync: () => acceptPortalSync,
  applyPortalAction: () => applyPortalAction,
  applyPortalGameVisit: () => applyPortalGameVisit,
  createPortalTrailEntry: () => createPortalTrailEntry,
  emptyPortalTrailState: () => emptyPortalTrailState,
  normalizePortalAction: () => normalizePortalAction,
  normalizePortalGameVisit: () => normalizePortalGameVisit,
  portalCallbackAllowed: () => portalCallbackAllowed,
  portalDestination: () => portalDestination,
  portalDeviceProfile: () => portalDeviceProfile,
  portalGameLink: () => portalGameLink,
  portalOffer: () => portalOffer,
  portalOwnerScope: () => portalOwnerScope,
  portalPairingId: () => portalPairingId,
  portalSuggestions: () => portalSuggestions,
  portalTrailKey: () => portalTrailKey,
  portalTrailPrefix: () => portalTrailPrefix,
  portalTrailSummary: () => portalTrailSummary,
  portalTrailView: () => portalTrailView,
  queuePortalAction: () => queuePortalAction,
  queuePortalGameVisit: () => queuePortalGameVisit,
  resolvePortalGameIntent: () => resolvePortalGameIntent,
  validatePortalTrailEntry: () => validatePortalTrailEntry,
  validatePortalTrailState: () => validatePortalTrailState
});
module.exports = __toCommonJS(stdin_exports);

// app/js/portal/trail-model.js
var PORTAL_TRAIL_VERSION = 1;
var id = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(value);
var time = (value) => Number.isSafeInteger(value) && value > 0;
var copy = (value) => JSON.parse(JSON.stringify(value));
var actionSlots = Object.freeze({ save: "saved", unsave: "saved", investigate: "investigated", offered: "offered" });
var commandSlot = (action) => action.kind === "visit" ? "visited" : actionSlots[action.kind];
var uidValid = (value) => typeof value === "string" && /^[^\u0000-\u001f\u007f]{1,128}$/u.test(value);
function portalOwnerScope(uid = null) {
  if (uid == null || uid === "") return "device-guest";
  if (!uidValid(uid)) throw new TypeError("Invalid Explorer identity.");
  return `account:${uid}`;
}
function portalTrailPrefix(ownerScope) {
  if (!(ownerScope === "device-guest" || typeof ownerScope === "string" && ownerScope.startsWith("account:") && uidValid(ownerScope.slice(8)))) {
    throw new TypeError("Trail records require an owner and destination.");
  }
  return `portal-trail:${encodeURIComponent(ownerScope)}|`;
}
function portalTrailKey(ownerScope, destinationId) {
  if (!id(destinationId)) throw new TypeError("Trail records require an owner and destination.");
  return `${portalTrailPrefix(ownerScope)}${destinationId}`;
}
function emptyPortalTrailState(destinationId) {
  if (!id(destinationId)) throw new TypeError("Invalid Portal destination.");
  return {
    destinationId,
    revision: 0,
    firstOfferedAt: 0,
    lastOfferedAt: 0,
    saved: false,
    savedAt: 0,
    investigatedAt: 0,
    investigationVersion: null,
    visitedAt: 0,
    expeditionIds: []
  };
}
function validatePortalTrailState(input, destinationId = input?.destinationId) {
  if (!input || input.destinationId !== destinationId || !id(destinationId) || !Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.saved !== "boolean" || !["firstOfferedAt", "lastOfferedAt", "savedAt", "investigatedAt", "visitedAt"].every((key) => input[key] === 0 || time(input[key])) || !(input.investigationVersion === null || id(input.investigationVersion)) || !Array.isArray(input.expeditionIds) || input.expeditionIds.length > 128 || !input.expeditionIds.every(id) || new Set(input.expeditionIds).size !== input.expeditionIds.length || input.investigatedAt > 0 && !input.investigationVersion || input.saved && !input.savedAt || input.firstOfferedAt > input.lastOfferedAt) throw new TypeError("Invalid Exploration Trail state.");
  return Object.fromEntries(Object.keys(emptyPortalTrailState(destinationId)).map((key) => [key, copy(input[key])]));
}
function normalizePortalAction(input) {
  if (!input || !id(input.operationId) || !id(input.destinationId) || !Object.hasOwn(actionSlots, input.kind) || !time(input.createdAt) || input.kind === "investigate" && !id(input.contentVersion)) {
    throw new TypeError("Invalid Portal action.");
  }
  return {
    operationId: input.operationId,
    destinationId: input.destinationId,
    kind: input.kind,
    createdAt: input.createdAt,
    ...input.kind === "investigate" ? { contentVersion: input.contentVersion } : {}
  };
}
function normalizePortalGameVisit(input) {
  if (input?.kind !== "visit" || !id(input.operationId) || !id(input.destinationId) || !time(input.createdAt) || !["destinationRevision", "contentVersion", "qualificationId", "deviceProfile", "worldRequestId"].every((key) => id(input[key])) || !["walk", "drive"].includes(input.arrivalMode)) throw new TypeError("Invalid Portal game visit.");
  return Object.fromEntries([
    "operationId",
    "destinationId",
    "kind",
    "createdAt",
    "destinationRevision",
    "contentVersion",
    "qualificationId",
    "deviceProfile",
    "worldRequestId",
    "arrivalMode"
  ].map((key) => [key, input[key]]));
}
var normalizeCommand = (input) => input?.kind === "visit" ? normalizePortalGameVisit(input) : normalizePortalAction(input);
function applyCommand(state, input, now = input.createdAt) {
  if (input.kind !== "visit") return applyPortalAction(state, input, now);
  const action = normalizePortalGameVisit(input), next = validatePortalTrailState(state, action.destinationId);
  if (!time(now)) throw new TypeError("Portal visits require a valid timestamp.");
  next.firstOfferedAt = next.firstOfferedAt ? Math.min(next.firstOfferedAt, now) : now;
  next.lastOfferedAt = Math.max(next.lastOfferedAt, now);
  next.visitedAt = Math.max(next.visitedAt, now);
  return next;
}
function applyPortalGameVisit(state, input, now = input?.createdAt) {
  return applyCommand(state, normalizePortalGameVisit(input), now);
}
function applyPortalAction(state, input, now = input?.createdAt) {
  const action = normalizePortalAction(input);
  const next = validatePortalTrailState(state, action.destinationId);
  if (!time(now)) throw new TypeError("Portal actions require a valid timestamp.");
  next.firstOfferedAt = next.firstOfferedAt ? Math.min(next.firstOfferedAt, now) : now;
  next.lastOfferedAt = Math.max(next.lastOfferedAt, now);
  if (action.kind === "save" || action.kind === "unsave") {
    next.saved = action.kind === "save";
    if (next.saved) next.savedAt = now;
  } else if (action.kind === "investigate") {
    next.investigatedAt = now;
    next.investigationVersion = action.contentVersion;
  }
  return next;
}
function createPortalTrailEntry(ownerScope, destinationId) {
  return {
    type: "PortalTrailEntry",
    schemaVersion: PORTAL_TRAIL_VERSION,
    id: portalTrailKey(ownerScope, destinationId),
    ownerScope,
    destinationId,
    state: emptyPortalTrailState(destinationId),
    pending: {}
  };
}
function validatePortalTrailEntry(input) {
  if (!input || input.type !== "PortalTrailEntry" || input.schemaVersion !== PORTAL_TRAIL_VERSION || input.id !== portalTrailKey(input.ownerScope, input.destinationId) || !input.pending || typeof input.pending !== "object" || Array.isArray(input.pending)) throw new TypeError("Invalid Trail cache record.");
  const state = validatePortalTrailState(input.state, input.destinationId);
  const pending = {};
  for (const [slot, value] of Object.entries(input.pending)) {
    const action = normalizeCommand(value);
    if (action.destinationId !== input.destinationId || commandSlot(action) !== slot || input.ownerScope === "device-guest") throw new TypeError("Invalid pending Trail action.");
    pending[slot] = action;
  }
  return { ...createPortalTrailEntry(input.ownerScope, input.destinationId), state, pending };
}
function queuePortalAction(entry, input) {
  return queueCommand(entry, normalizePortalAction(input));
}
function queuePortalGameVisit(entry, input) {
  return queueCommand(entry, normalizePortalGameVisit(input));
}
function queueCommand(entry, action) {
  const next = validatePortalTrailEntry(entry);
  if (action.destinationId !== next.destinationId) throw new TypeError("Portal action changed destination.");
  if (next.ownerScope === "device-guest") next.state = applyCommand(next.state, action);
  else next.pending[commandSlot(action)] = action;
  return next;
}
function portalTrailView(entry) {
  const next = validatePortalTrailEntry(entry);
  let state = next.state;
  for (const action of Object.values(next.pending).sort((a, b) => a.createdAt - b.createdAt || a.operationId.localeCompare(b.operationId))) {
    state = applyCommand(state, action);
  }
  return { ...state, pending: Object.keys(next.pending).length > 0, ownerScope: next.ownerScope };
}
function acceptPortalSync(entry, response, expectedOwnerScope) {
  const next = validatePortalTrailEntry(entry);
  if (expectedOwnerScope !== next.ownerScope || response?.ownerScope !== next.ownerScope || response?.state?.destinationId !== next.destinationId) throw new TypeError("Trail synchronization changed account or place.");
  const state = validatePortalTrailState(response.state, next.destinationId);
  if (state.revision >= next.state.revision) next.state = state;
  for (const [slot, action] of Object.entries(next.pending)) {
    if (action.operationId === response.operationId) delete next.pending[slot];
  }
  return next;
}
function portalTrailSummary(entries2) {
  const views = entries2.map(portalTrailView);
  return {
    offered: views.filter((row) => row.firstOfferedAt > 0).length,
    saved: views.filter((row) => row.saved).length,
    investigated: views.filter((row) => row.investigatedAt > 0).length,
    visited: views.filter((row) => row.visitedAt > 0).length,
    expeditions: new Set(views.flatMap((row) => row.expeditionIds)).size,
    pending: views.filter((row) => row.pending).length
  };
}

// app/js/portal/catalog.js
var entries = [
  {
    id: "baltimore-harbor",
    title: "Baltimore \xB7 A city shaped by water",
    region: "Maryland, United States",
    topic: "Harbors & history",
    tags: ["city", "coast", "nature"],
    preset: "baltimore",
    summary: "Meet the working waterfront where city streets and the Chesapeake watershed come together.",
    image: "/assets/landing/current/baltimore-harbor-hero.webp",
    imageAlt: "World Explorer gameplay at Baltimore harbor",
    learning: {
      version: "2026.10.25.1",
      title: "A harbor is more than a shoreline",
      paragraphs: [
        "Baltimore\u2019s port connects the city to the Chesapeake Bay. Its channels have been surveyed and deepened over generations so ships can reach the waterfront.",
        "Water depth, coastline shape and access from land all influence where a port can grow. As you look at a harbor, notice the sheltered water and the roads that connect its edges.",
        "In World Explorer, look for the meeting of streets and water. Learning about a place here is recorded separately from visiting its 3D world."
      ],
      sources: [{ title: "Maryland State Archives \xB7 Port of Baltimore", url: "https://msa.maryland.gov/msa/mdmanual/01glance/html/port.html" }]
    },
    destination: {
      type: "PortalDestination",
      schemaVersion: 1,
      id: "baltimore-harbor",
      revision: "1",
      contentVersion: "baltimore-portal-1",
      environment: "EARTH",
      kind: "city",
      origin: { lat: 39.2904, lon: -76.6122 },
      bounds: { south: 39.26, north: 39.32, west: -76.65, east: -76.57 },
      // This is self-guided exploration, not a registered mission or an expedition award.
      arrival: { lat: 39.2904, lon: -76.6122, mode: "walk" },
      experienceIds: ["waterfront-exploration"]
    }
  },
  {
    id: "monaco-coast",
    title: "Monaco \xB7 Where land meets the Mediterranean",
    region: "Monaco",
    topic: "Coasts & navigation",
    tags: ["coast", "nature", "city"],
    preset: "monaco",
    summary: "Investigate a natural bay and the relationship between a compact coastal city and the sea.",
    image: null,
    imageAlt: null,
    learning: {
      version: "2026.10.25.1",
      title: "Why a sheltered bay matters",
      paragraphs: [
        "Port Hercule occupies a natural bay below Monaco\u2019s historic rock. The shape of the coast helps explain why this location became a harbor.",
        "A harbor gives boats a place to gather and shelter. Its entrance, breakwaters and surrounding land each influence the journey between open sea and shore.",
        "When exploring a coastal world, compare the open water with the enclosed basin. A map can show the coastline, while walking or driving reveals how steeply the land rises."
      ],
      sources: [{ title: "Ports of Monaco \xB7 Port Hercule", url: "https://www.ports-monaco.com/en/the-ports-of-monaco/port-hercule/" }]
    },
    destination: {
      type: "PortalDestination",
      schemaVersion: 1,
      id: "monaco-coast",
      revision: "1",
      contentVersion: "monaco-portal-1",
      environment: "EARTH",
      kind: "coast",
      origin: { lat: 43.7384, lon: 7.4246 },
      bounds: { south: 43.71, north: 43.77, west: 7.39, east: 7.46 },
      arrival: { lat: 43.7384, lon: 7.4246, mode: "walk" },
      experienceIds: ["coastal-exploration"]
    }
  }
];
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
var PORTAL_CATALOG = freeze({ schemaVersion: 1, version: "2026.10.27.1", destinations: entries, qualifications: [
  {
    "type": "PortalQualification",
    "schemaVersion": 1,
    "status": "approved",
    "destinationId": "baltimore-harbor",
    "destinationRevision": "1",
    "kind": "city",
    "contentVersion": "baltimore-portal-1",
    "renderContractVersion": "earth-main:2026.10.27.1",
    "origin": {
      "lat": 39.2904,
      "lon": -76.6122
    },
    "bounds": {
      "south": 39.26,
      "north": 39.32,
      "west": -76.65,
      "east": -76.57
    },
    "arrival": {
      "lat": 39.2904,
      "lon": -76.6122,
      "mode": "walk"
    },
    "deviceProfile": "desktop",
    "testedBuildId": "5.6.1+2d9ad8ad913d.cdf024cda84cd6e4.staging",
    "checkedAt": 1793142629766,
    "validUntil": 1800918629766,
    "evidenceId": "portal:baltimore:desktop:2026.10.27",
    "checks": {
      "geographicIdentity": "passed",
      "visualExperience": "passed",
      "safeArrival": "passed",
      "playableContent": "passed",
      "devicePerformance": "passed"
    },
    "layers": {
      "terrain": "verified",
      "transport": "verified",
      "buildings": "verified",
      "places": "verified"
    },
    "experienceIds": [
      "waterfront-exploration"
    ]
  },
  {
    "type": "PortalQualification",
    "schemaVersion": 1,
    "status": "approved",
    "destinationId": "baltimore-harbor",
    "destinationRevision": "1",
    "kind": "city",
    "contentVersion": "baltimore-portal-1",
    "renderContractVersion": "earth-main:2026.10.27.1",
    "origin": {
      "lat": 39.2904,
      "lon": -76.6122
    },
    "bounds": {
      "south": 39.26,
      "north": 39.32,
      "west": -76.65,
      "east": -76.57
    },
    "arrival": {
      "lat": 39.2904,
      "lon": -76.6122,
      "mode": "walk"
    },
    "deviceProfile": "mobile-touch",
    "testedBuildId": "5.6.1+2d9ad8ad913d.cdf024cda84cd6e4.staging",
    "checkedAt": 1793142629766,
    "validUntil": 1800918629766,
    "evidenceId": "portal:baltimore:mobile-touch:2026.10.27",
    "checks": {
      "geographicIdentity": "passed",
      "visualExperience": "passed",
      "safeArrival": "passed",
      "playableContent": "passed",
      "devicePerformance": "passed"
    },
    "layers": {
      "terrain": "verified",
      "transport": "verified",
      "buildings": "verified",
      "places": "verified"
    },
    "experienceIds": [
      "waterfront-exploration"
    ]
  }
] });
function portalDestination(id2) {
  return PORTAL_CATALOG.destinations.find((row) => row.id === id2) || null;
}
function portalSuggestions({ mode = "wander", homeId = null, day = Math.floor(Date.now() / 864e5) } = {}) {
  if (mode === "home") return entries.filter((row) => row.id === homeId);
  if (mode === "together" || mode === "beyond") return [];
  const rows = mode === "nature" ? entries.filter((row) => row.tags.includes("nature")) : [...entries];
  const offset = (day % rows.length + rows.length) % rows.length;
  return [...rows.slice(offset), ...rows.slice(0, offset)];
}

// app/js/earth-core/portal-destination-policy.js
var PORTAL_QUALIFICATION_VERSION = 1;
var PORTAL_QUALITY_CHECKS = Object.freeze([
  "geographicIdentity",
  "visualExperience",
  "safeArrival",
  "playableContent",
  "devicePerformance"
]);
var profiles = Object.freeze({
  city: Object.freeze(["terrain", "transport", "buildings", "places"]),
  nature: Object.freeze(["terrain", "landuse", "places"]),
  coast: Object.freeze(["terrain", "hydrology", "landuse", "places"])
});
var identifier = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(value);
var buildIdentity = (value) => typeof value === "string" && value.length > 0 && value.length <= 200 && /^[a-z0-9.+_:-]+$/i.test(value);
var timestamp = (value) => Number.isSafeInteger(value) && value > 0;
var point = (value) => Number.isFinite(value?.lat) && Math.abs(value.lat) <= 90 && Number.isFinite(value?.lon) && Math.abs(value.lon) <= 180;
var bounds = (value) => value && [value.south, value.north, value.west, value.east].every(Number.isFinite) && value.south < value.north && value.south >= -90 && value.north <= 90 && Math.abs(value.west) <= 180 && Math.abs(value.east) <= 180 && value.west !== value.east && !(value.west === 180 && value.east === -180);
function contains(area, location) {
  if (!bounds(area) || !point(location) || location.lat < area.south || location.lat > area.north) return false;
  const longitude = location.lon === 180 ? -180 : location.lon;
  return area.west <= area.east ? longitude >= area.west && longitude <= area.east || longitude === -180 && area.east === 180 : longitude >= area.west || longitude <= area.east;
}
var ids = (value) => Array.isArray(value) && value.length > 0 && value.length <= 32 && value.every(identifier) && new Set(value).size === value.length;
var sameFields = (left, right, fields) => !!left && !!right && fields.every((key) => left[key] === right[key]);
function portalDestinationRequirements(destination) {
  const base = Object.hasOwn(profiles, destination?.kind) ? profiles[destination.kind] : null;
  if (!base) return null;
  return Object.freeze([.../* @__PURE__ */ new Set([...base, ...destination.arrival?.mode === "drive" ? ["transport"] : []])]);
}
function destinationValid(destination) {
  return destination?.type === "PortalDestination" && destination.schemaVersion === 1 && identifier(destination.id) && identifier(destination.revision) && identifier(destination.contentVersion) && destination.environment === "EARTH" && portalDestinationRequirements(destination) !== null && point(destination.origin) && point(destination.arrival) && bounds(destination.bounds) && contains(destination.bounds, destination.origin) && contains(destination.bounds, destination.arrival) && ["walk", "drive"].includes(destination.arrival.mode) && ids(destination.experienceIds);
}
function decision(destination, requiredLayers, reasons) {
  return Object.freeze({
    destinationId: identifier(destination?.id) ? destination.id : null,
    eligible: reasons.length === 0,
    requiredLayers: requiredLayers || Object.freeze([]),
    reasons: Object.freeze([...new Set(reasons)])
  });
}
function evaluatePortalOffer(destination, assessment, context = {}) {
  context ??= {};
  const required = portalDestinationRequirements(destination);
  const reasons = [];
  if (!destinationValid(destination)) return decision(destination, required, ["invalid-destination"]);
  if (!timestamp(context.now) || !identifier(context.deviceProfile) || !identifier(context.renderContractVersion) || !identifier(context.contentVersion)) {
    reasons.push("missing-qualification-context");
  }
  if (assessment?.type !== "PortalQualification" || assessment.schemaVersion !== PORTAL_QUALIFICATION_VERSION || assessment.status !== "approved" || !identifier(assessment.evidenceId) || !buildIdentity(assessment.testedBuildId)) {
    return decision(destination, required, [...reasons, "missing-approved-qualification"]);
  }
  if (assessment.destinationId !== destination.id || assessment.destinationRevision !== destination.revision || assessment.kind !== destination.kind || !sameFields(assessment.origin, destination.origin, ["lat", "lon"]) || !sameFields(assessment.bounds, destination.bounds, ["south", "north", "west", "east"]) || !sameFields(assessment.arrival, destination.arrival, ["lat", "lon", "mode"])) reasons.push("qualification-scope-mismatch");
  if (assessment.contentVersion !== destination.contentVersion || assessment.contentVersion !== context.contentVersion || assessment.renderContractVersion !== context.renderContractVersion) reasons.push("qualification-version-mismatch");
  if (assessment.deviceProfile !== context.deviceProfile) reasons.push("device-not-qualified");
  if (!timestamp(assessment.checkedAt) || !timestamp(assessment.validUntil) || assessment.checkedAt > context.now || assessment.validUntil <= context.now || assessment.checkedAt >= assessment.validUntil) reasons.push("qualification-not-current");
  for (const check of PORTAL_QUALITY_CHECKS) {
    if (assessment.checks?.[check] !== "passed") reasons.push(`unverified-${check}`);
  }
  for (const layer of required) {
    if (assessment.layers?.[layer] !== "verified") reasons.push(`unverified-layer:${layer}`);
  }
  if (!ids(assessment.experienceIds) || destination.experienceIds.some((id2) => !assessment.experienceIds.includes(id2))) {
    reasons.push("unverified-experience");
  }
  return decision(destination, required, reasons);
}

// app/js/portal/game-intent.js
var PORTAL_RENDER_CONTRACT = "earth-main:2026.10.27.1";
function portalDeviceProfile(host = globalThis) {
  return host.matchMedia?.("(pointer: coarse)").matches === true ? "mobile-touch" : "desktop";
}
function portalOffer(place, catalog, context = {}) {
  const qualification = catalog?.qualifications?.find((row) => row.destinationId === place?.id && row.deviceProfile === context.deviceProfile && row.evidenceId === (context.evidenceId ?? row.evidenceId));
  const decision2 = evaluatePortalOffer(place?.destination, qualification, {
    ...context,
    renderContractVersion: PORTAL_RENDER_CONTRACT,
    contentVersion: place?.destination?.contentVersion
  });
  return { place, qualification, decision: decision2 };
}
function portalGameLink(place) {
  return `/app/?portal=${encodeURIComponent(place.id)}&pr=${encodeURIComponent(place.destination.revision)}`;
}
function resolvePortalGameIntent(search, catalog, context) {
  const params = new URLSearchParams(search);
  if (!params.has("portal")) return null;
  if (params.getAll("portal").length !== 1 || params.getAll("pr").length !== 1 || [...params.keys()].some((key) => !["portal", "pr", "distribution", "graphicsDiagnostics"].includes(key))) {
    return { decision: { eligible: false, reasons: ["conflicting-portal-intent"] } };
  }
  const place = catalog.destinations.find((row) => row.id === params.get("portal"));
  if (!place || place.destination.revision !== params.get("pr")) return { decision: { eligible: false, reasons: ["unknown-portal-revision"] } };
  return portalOffer(place, catalog, context);
}

// app/js/portal/native-contract.js
var PORTAL_NATIVE_CLIENTS = Object.freeze({
  "worldexplorer3d-d9b83": Object.freeze({
    "1:469573887496:android:074e2769d10bcbdd42d3bd": Object.freeze({ platform: "android", label: "World Explorer 3D for Android", callback: "io.worldexplorer3d.app://portal-connect" }),
    "1:469573887496:ios:e86ce3a7af39b6d842d3bd": Object.freeze({ platform: "ios", label: "World Explorer 3D for Apple", callback: "io.worldexplorer3d.app://portal-connect" })
  }),
  "we3d-staging-20260712": Object.freeze({
    "1:524178734996:android:eededce4f644ea41f51981": Object.freeze({ platform: "android", label: "World Explorer 3D for Android \xB7 development", callback: "io.worldexplorer3d.app.staging://portal-connect" }),
    "1:524178734996:ios:2d8e12cf5c57d2cef51981": Object.freeze({ platform: "ios", label: "World Explorer 3D for Apple \xB7 development", callback: "io.worldexplorer3d.app.staging://portal-connect" }),
    "1:524178734996:android:b6c8ac1247bbf6f3f51981": Object.freeze({ platform: "android", label: "World Explorer 3D for Android \xB7 test build", callback: "io.worldexplorer3d.app.staging://portal-connect" }),
    "1:524178734996:ios:84e80cd71e77579cf51981": Object.freeze({ platform: "ios", label: "World Explorer 3D for Apple \xB7 test build", callback: "io.worldexplorer3d.app.staging://portal-connect" })
  })
});
var portalPairingId = (value) => typeof value === "string" && value.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(value);
function portalCallbackAllowed(value, projectId) {
  return Object.values(PORTAL_NATIVE_CLIENTS[projectId] || {}).some((client) => client.callback === value);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PORTAL_CATALOG,
  PORTAL_NATIVE_CLIENTS,
  PORTAL_RENDER_CONTRACT,
  PORTAL_TRAIL_VERSION,
  acceptPortalSync,
  applyPortalAction,
  applyPortalGameVisit,
  createPortalTrailEntry,
  emptyPortalTrailState,
  normalizePortalAction,
  normalizePortalGameVisit,
  portalCallbackAllowed,
  portalDestination,
  portalDeviceProfile,
  portalGameLink,
  portalOffer,
  portalOwnerScope,
  portalPairingId,
  portalSuggestions,
  portalTrailKey,
  portalTrailPrefix,
  portalTrailSummary,
  portalTrailView,
  queuePortalAction,
  queuePortalGameVisit,
  resolvePortalGameIntent,
  validatePortalTrailEntry,
  validatePortalTrailState
});

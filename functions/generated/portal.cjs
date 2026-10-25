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
  PORTAL_TRAIL_VERSION: () => PORTAL_TRAIL_VERSION,
  acceptPortalSync: () => acceptPortalSync,
  applyPortalAction: () => applyPortalAction,
  createPortalTrailEntry: () => createPortalTrailEntry,
  emptyPortalTrailState: () => emptyPortalTrailState,
  normalizePortalAction: () => normalizePortalAction,
  portalDestination: () => portalDestination,
  portalOwnerScope: () => portalOwnerScope,
  portalSuggestions: () => portalSuggestions,
  portalTrailKey: () => portalTrailKey,
  portalTrailPrefix: () => portalTrailPrefix,
  portalTrailSummary: () => portalTrailSummary,
  portalTrailView: () => portalTrailView,
  queuePortalAction: () => queuePortalAction,
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
    const action = normalizePortalAction(value);
    if (action.destinationId !== input.destinationId || actionSlots[action.kind] !== slot || input.ownerScope === "device-guest") throw new TypeError("Invalid pending Trail action.");
    pending[slot] = action;
  }
  return { ...createPortalTrailEntry(input.ownerScope, input.destinationId), state, pending };
}
function queuePortalAction(entry, input) {
  const next = validatePortalTrailEntry(entry), action = normalizePortalAction(input);
  if (action.destinationId !== next.destinationId) throw new TypeError("Portal action changed destination.");
  if (next.ownerScope === "device-guest") next.state = applyPortalAction(next.state, action);
  else next.pending[actionSlots[action.kind]] = action;
  return next;
}
function portalTrailView(entry) {
  const next = validatePortalTrailEntry(entry);
  let state = next.state;
  for (const action of Object.values(next.pending).sort((a, b) => a.createdAt - b.createdAt || a.operationId.localeCompare(b.operationId))) {
    state = applyPortalAction(state, action);
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
var PORTAL_CATALOG = freeze({ schemaVersion: 1, version: "2026.10.25.1", destinations: entries, qualifications: [] });
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PORTAL_CATALOG,
  PORTAL_TRAIL_VERSION,
  acceptPortalSync,
  applyPortalAction,
  createPortalTrailEntry,
  emptyPortalTrailState,
  normalizePortalAction,
  portalDestination,
  portalOwnerScope,
  portalSuggestions,
  portalTrailKey,
  portalTrailPrefix,
  portalTrailSummary,
  portalTrailView,
  queuePortalAction,
  validatePortalTrailEntry,
  validatePortalTrailState
});

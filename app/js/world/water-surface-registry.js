import {
  WATER_BODY_SHAPE,
  normalizeWaterBody,
  polygonMetrics
} from './water-body-contract.js?v=3';

const WATER_SURFACE_REGISTRY_SCHEMA_VERSION = 1;

function freezeRecord(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeRecord);
  return Object.freeze(value);
}

function pointInRing(x, z, ring = []) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index];
    const b = ring[previous];
    const crosses = (a.z > z) !== (b.z > z) &&
      x < (b.x - a.x) * (z - a.z) / ((b.z - a.z) || 1e-9) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInWaterBody(body, x, z) {
  if (!body || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (body.shape === WATER_BODY_SHAPE.WATERWAY) return false;
  if (!pointInRing(x, z, body.pts)) return false;
  return !(body.holes || []).some((ring) => pointInRing(x, z, ring));
}

function sourcePriority(body) {
  const dataset = String(body?.provenance?.dataset || '').toLowerCase();
  const layer = String(body?.provenance?.layer || '').toLowerCase();
  if (dataset.includes('osm-overpass')) return 500;
  if (dataset.includes('overture')) return 450;
  if (dataset.includes('shortbread') && layer === 'water_polygons') return 400;
  if (dataset.includes('shortbread') && layer === 'ocean') return 350;
  if (dataset.includes('shortbread')) return 300;
  if (dataset.includes('synthetic')) return 50;
  return 200;
}

function registryIdentity(body, fallbackIndex = 0) {
  const featureId = String(body?.sourceFeatureId || body?.provenance?.featureId || '').trim();
  if (featureId) return `water:${featureId}`;
  const metrics = body?.shape === WATER_BODY_SHAPE.AREA
    ? polygonMetrics(body?.pts || [])
    : { centerX: body?.centerX || 0, centerZ: body?.centerZ || 0, area: 0 };
  return [
    'water',
    body?.shape || 'area',
    body?.provenance?.dataset || 'unknown',
    Number(metrics.centerX || 0).toFixed(2),
    Number(metrics.centerZ || 0).toFixed(2),
    Math.round(Number(metrics.area || body?.length || 0)),
    fallbackIndex
  ].join(':');
}

function boundsOverlapRatio(a, b) {
  const ab = a?.bounds;
  const bb = b?.bounds;
  if (!ab || !bb) return 0;
  const width = Math.max(0, Math.min(ab.maxX, bb.maxX) - Math.max(ab.minX, bb.minX));
  const depth = Math.max(0, Math.min(ab.maxZ, bb.maxZ) - Math.max(ab.minZ, bb.minZ));
  if (!(width > 0 && depth > 0)) return 0;
  const areaA = Math.max(1, (ab.maxX - ab.minX) * (ab.maxZ - ab.minZ));
  const areaB = Math.max(1, (bb.maxX - bb.minX) * (bb.maxZ - bb.minZ));
  return width * depth / Math.min(areaA, areaB);
}

function surfacesDuplicate(a, b) {
  if (!a || !b || a.shape !== b.shape) return false;
  const aId = String(a.sourceFeatureId || '');
  const bId = String(b.sourceFeatureId || '');
  if (aId && bId && aId === bId) return true;
  if (a.shape === WATER_BODY_SHAPE.WATERWAY) return false;
  const overlap = boundsOverlapRatio(a, b);
  if (overlap < 0.88) return false;
  const heightDelta = Math.abs(Number(a.surfaceY || 0) - Number(b.surfaceY || 0));
  if (heightDelta > 2) return false;
  const centerContained =
    pointInWaterBody(a, Number(b.centerX), Number(b.centerZ)) ||
    pointInWaterBody(b, Number(a.centerX), Number(a.centerZ));
  return overlap >= 0.98 || centerContained;
}

function compileWaterSurfaceProvenance(body, registryId) {
  const source = body?.provenance || {};
  return freezeRecord({
    schemaVersion: WATER_SURFACE_REGISTRY_SCHEMA_VERSION,
    authority: 'water_surface_registry',
    registryId,
    featureId: body?.sourceFeatureId || null,
    geometrySource: source.dataset || 'unknown',
    tileKey: source.tileKey || null,
    layer: source.layer || null,
    shape: body?.shape || null,
    waterKind: body?.waterKind || null,
    surfaceDatum: body?.datum || null,
    navigable: body?.navigable === true,
    synthetic: body?.synthetic === true
  });
}

function createWaterSurfaceRegistry(initialBodies = []) {
  const entries = [];
  let sequence = 0;

  function register(input) {
    const body = input?.waterSchemaVersion ? input : normalizeWaterBody(input || {});
    const registryId = registryIdentity(body, sequence++);
    const duplicates = entries.filter((entry) => surfacesDuplicate(entry.body, body));
    const candidatePriority = sourcePriority(body);
    const winner = duplicates
      .map((entry) => ({ entry, priority: sourcePriority(entry.body) }))
      .sort((a, b) => b.priority - a.priority)[0] || null;
    if (
      winner &&
      (
        winner.priority > candidatePriority ||
        (
          winner.priority === candidatePriority &&
          Number(winner.entry.body.area || winner.entry.body.length || 0) >=
            Number(body.area || body.length || 0)
        )
      )
    ) {
      return Object.freeze({
        accepted: false,
        reason: 'duplicate_lower_priority',
        body,
        owner: winner.entry.body,
        replacements: Object.freeze([])
      });
    }

    const replacements = duplicates.map((entry) => entry.body);
    for (const duplicate of duplicates) {
      const index = entries.indexOf(duplicate);
      if (index >= 0) entries.splice(index, 1);
    }
    const provenance = compileWaterSurfaceProvenance(body, registryId);
    Object.assign(body, {
      registryId,
      authority: 'water_surface_registry',
      registryProvenance: provenance
    });
    entries.push({ body, provenance });
    return Object.freeze({
      accepted: true,
      reason: null,
      body,
      owner: body,
      replacements: Object.freeze(replacements)
    });
  }

  function remove(body) {
    const index = entries.findIndex((entry) =>
      entry.body === body || entry.body.registryId === body?.registryId
    );
    if (index < 0) return false;
    entries.splice(index, 1);
    return true;
  }

  function snapshot() {
    const records = entries.map((entry) => entry.provenance);
    return freezeRecord({
      schemaVersion: WATER_SURFACE_REGISTRY_SCHEMA_VERSION,
      authority: 'water_surface_registry',
      surfaceCount: entries.length,
      navigableCount: entries.filter((entry) => entry.body.navigable === true).length,
      duplicateRegistryIds: records
        .map((record) => record.registryId)
        .filter((id, index, all) => all.indexOf(id) !== index),
      records
    });
  }

  initialBodies.forEach(register);
  return Object.freeze({
    register,
    remove,
    snapshot,
    entries: () => entries.map((entry) => entry.body)
  });
}

export {
  WATER_SURFACE_REGISTRY_SCHEMA_VERSION,
  compileWaterSurfaceProvenance,
  createWaterSurfaceRegistry,
  pointInRing,
  pointInWaterBody,
  sourcePriority,
  surfacesDuplicate
};

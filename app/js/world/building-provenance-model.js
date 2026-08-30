const BUILDING_PROVENANCE_SCHEMA_VERSION = 1;

const BUILDING_GEOMETRY_AUTHORITY = Object.freeze({
  OVERTURE: 'overture',
  OSM: 'osm',
  SHORTBREAD: 'shortbread',
  INFERRED: 'inferred'
});

const PROVENANCE_FIELDS = Object.freeze([
  ['name', ['name']],
  ['buildingType', ['building', 'building:part']],
  ['heightMeters', ['height']],
  ['levels', ['building:levels']],
  ['minHeightMeters', ['min_height']],
  ['minLevel', ['building:min_level']],
  ['facadeMaterial', ['building:material']],
  ['facadeColor', ['building:colour', 'building:color']],
  ['roofShape', ['roof:shape']],
  ['roofHeightMeters', ['roof:height']],
  ['roofMaterial', ['roof:material']],
  ['roofColor', ['roof:colour', 'roof:color']]
]);

function freezeRecord(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeRecord);
  return Object.freeze(value);
}

function normalizedString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function firstMappedTag(tags, keys) {
  for (const key of keys) {
    const value = normalizedString(tags?.[key]);
    if (value) return { key, value };
  }
  return null;
}

function geometryAuthority(tags = {}) {
  const source = normalizedString(tags._geometrySource).toLowerCase();
  if (source === 'overture') return BUILDING_GEOMETRY_AUTHORITY.OVERTURE;
  if (source.includes('shortbread')) return BUILDING_GEOMETRY_AUTHORITY.SHORTBREAD;
  if (source.startsWith('inferred')) return BUILDING_GEOMETRY_AUTHORITY.INFERRED;
  return BUILDING_GEOMETRY_AUTHORITY.OSM;
}

function stableFeatureId(tags = {}, fallbackIdentity = '') {
  const sourceId = normalizedString(tags._sourceFeatureId);
  if (sourceId) return sourceId;
  const authority = geometryAuthority(tags);
  return `${authority}:${normalizedString(fallbackIdentity) || 'unidentified'}`;
}

function isStableBuildingMetadataMapping(tags = {}) {
  const geometryId = stableFeatureId(tags);
  const metadataId = normalizedString(tags._buildingMetadataSourceId);
  const mapping = normalizedString(tags._buildingMetadataMapping);
  if (!metadataId) return true;
  const bundledSpatialIdentity =
    mapping === 'bundled_osm_spatial_identity' &&
    normalizedString(tags._buildingMetadataProvider).startsWith('bundled-osm:') &&
    metadataId.startsWith('osm:way:');
  if (!['explicit_stable_id', 'same_source_feature'].includes(mapping) && !bundledSpatialIdentity) {
    return false;
  }
  const explicitGeometryId = normalizedString(tags._buildingMetadataGeometryId);
  return !!explicitGeometryId && explicitGeometryId === geometryId;
}

function inferredValueForField(field, computed = {}) {
  if (field === 'heightMeters') return computed.heightMeters;
  if (field === 'levels') return computed.levels;
  if (field === 'minHeightMeters') return computed.baseOffsetMeters;
  if (field === 'minLevel') return computed.minLevel;
  if (field === 'buildingType') return computed.buildingType;
  return computed[field];
}

function compileBuildingProvenance(tags = {}, computed = {}) {
  const authority = geometryAuthority(tags);
  const featureId = stableFeatureId(tags, computed.fallbackIdentity);
  const parentFeatureId = normalizedString(
    tags._overtureParentBuildingId || tags._parentFeatureId
  ) || null;
  const role = normalizedString(tags['building:part']) ? 'part' : 'outline';
  const metadataSourceId = normalizedString(tags._buildingMetadataSourceId) || null;
  const stableMetadataMapping = isStableBuildingMetadataMapping(tags);
  const fields = {};

  for (const [field, tagKeys] of PROVENANCE_FIELDS) {
    const mapped = firstMappedTag(tags, tagKeys);
    const inferredValue = inferredValueForField(field, computed);
    if (mapped) {
      fields[field] = {
        value: mapped.value,
        status: 'mapped',
        tag: mapped.key,
        sourceFeatureId:
          metadataSourceId && stableMetadataMapping ? metadataSourceId : featureId
      };
    } else if (inferredValue !== null && inferredValue !== undefined && inferredValue !== '') {
      fields[field] = {
        value: inferredValue,
        status: 'inferred',
        method: normalizedString(computed.inferenceMethods?.[field]) || 'deterministic_fallback',
        sourceFeatureId: featureId
      };
    } else {
      fields[field] = {
        value: null,
        status: 'absent',
        sourceFeatureId: featureId
      };
    }
  }

  const landmarkMapped = !!firstMappedTag(tags, ['name']);
  const valid = featureId !== `${authority}:unidentified` && stableMetadataMapping;
  return freezeRecord({
    schemaVersion: BUILDING_PROVENANCE_SCHEMA_VERSION,
    authority: 'compiled_building_provenance',
    valid,
    invalidReason:
      valid ? null :
      !stableMetadataMapping ? 'ambiguous_cross_source_metadata' : 'stable_feature_identity_missing',
    identity: {
      geometryAuthority: authority,
      featureId,
      parentFeatureId,
      role
    },
    geometry: {
      source: normalizedString(tags._geometrySource) || authority,
      inferred: authority === BUILDING_GEOMETRY_AUTHORITY.INFERRED,
      coverageComplete: tags._geometryCoverageComplete !== 'no'
    },
    foundation: {
      authority: 'accepted_ground',
      baseY: Number.isFinite(computed.foundationBaseY) ? computed.foundationBaseY : null,
      groundBaseY: Number.isFinite(computed.foundationGroundBaseY)
        ? computed.foundationGroundBaseY
        : Number.isFinite(computed.foundationBaseY)
          ? computed.foundationBaseY
          : null,
      structureBaseOffsetMeters: Number.isFinite(computed.structureBaseOffsetMeters)
        ? computed.structureBaseOffsetMeters
        : 0,
      minimumGroundY: Number.isFinite(computed.minimumGroundY) ? computed.minimumGroundY : null,
      maximumGroundY: Number.isFinite(computed.maximumGroundY) ? computed.maximumGroundY : null,
      sampleCount: Number.isFinite(computed.foundationSampleCount)
        ? computed.foundationSampleCount
        : 0,
      terrainMutation: false
    },
    metadata: {
      sourceFeatureId: metadataSourceId,
      mapping: metadataSourceId
        ? normalizedString(tags._buildingMetadataMapping) || 'ambiguous'
        : 'same_feature',
      stable: stableMetadataMapping
    },
    landmark: {
      mapped: landmarkMapped,
      genericOverrideAllowed: !landmarkMapped
    },
    fields
  });
}

function shouldSuppressBuildingParent(options = {}) {
  return options.coverageComplete === true &&
    options.hasParts === true &&
    !!normalizedString(options.stableId) &&
    options.parentIdsWithParts?.has?.(normalizedString(options.stableId)) === true;
}

function createBuildingProvenanceSnapshot(records = []) {
  const safeRecords = records.filter((record) =>
    record?.authority === 'compiled_building_provenance'
  );
  const ids = safeRecords.map((record) => record.identity.featureId);
  const seenIds = new Set();
  const duplicateIds = new Set();
  ids.forEach((id) => {
    if (seenIds.has(id)) duplicateIds.add(id);
    else seenIds.add(id);
  });
  return freezeRecord({
    schemaVersion: BUILDING_PROVENANCE_SCHEMA_VERSION,
    authority: 'compiled_building_provenance',
    featureCount: safeRecords.length,
    validCount: safeRecords.filter((record) => record.valid === true).length,
    outlineCount: safeRecords.filter((record) => record.identity.role === 'outline').length,
    partCount: safeRecords.filter((record) => record.identity.role === 'part').length,
    inferredGeometryCount: safeRecords.filter((record) => record.geometry.inferred === true).length,
    ambiguousMetadataCount: safeRecords.filter((record) => record.metadata.stable !== true).length,
    duplicateFeatureIds: [...duplicateIds],
    records: safeRecords
  });
}

export {
  BUILDING_GEOMETRY_AUTHORITY,
  BUILDING_PROVENANCE_SCHEMA_VERSION,
  compileBuildingProvenance,
  createBuildingProvenanceSnapshot,
  geometryAuthority,
  isStableBuildingMetadataMapping,
  shouldSuppressBuildingParent,
  stableFeatureId
};

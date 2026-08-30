#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  chunkGroundPoints,
  createGroundArtifactBundle,
  createGroundBuildPlan,
  fetchUsgs3depSamples,
  normalizeGroundSamples
} from './lib/ground-artifact-builder.mjs';
import {
  decodeUncompressedFloat32Tiff
} from './lib/tiff-f32.mjs';
import {
  buildCopernicusGroundSamples,
  COPERNICUS_DEM_ATTRIBUTION,
  COPERNICUS_DEM_90_ATTRIBUTION,
  COPERNICUS_DEM_LICENSE_DOCUMENT,
  COPERNICUS_DEM_LIABILITY_NOTICE,
  COPERNICUS_DEM_90_LIABILITY_NOTICE
} from './lib/copernicus-ground-builder.mjs';

const USGS_3DEP_EXPORT_URL =
  'https://elevation.nationalmap.gov/arcgis/rest/services/' +
  '3DEPElevation/ImageServer/exportImage';

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function flag(name, fallback = '') {
  const exact = process.argv.find((argument) =>
    argument.startsWith(`${name}=`)
  );
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length
    ? process.argv[index + 1]
    : fallback;
}

function requiredFlag(name) {
  const value = flag(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function numberFlag(name, fallback) {
  const raw = flag(name, fallback === undefined ? '' : String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

async function readJson(filePath) {
  const text = await fs.readFile(path.resolve(filePath), 'utf8');
  return { text, value: JSON.parse(text) };
}

async function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, canonicalJson(value), 'utf8');
  return absolute;
}

async function writeText(filePath, text) {
  const absolute = path.resolve(filePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, text, 'utf8');
  return absolute;
}

function help() {
  return `
WorldExplorer3D accepted-ground artifact builder

Commands:
  plan
    --district-id ID --center-lat LAT --center-lon LON
    --width-m M --height-m M --spacing-m M --output FILE

  fetch-usgs
    --plan FILE --output FILE [--batch-size 200] [--concurrency 6]

  fetch-usgs-export
    --plan FILE --source-template FILE --output FILE
    [--export-spacing-m 5]

  compile
    --raw FILE --normalization FILE --output-dir DIRECTORY

  compile-copernicus
    --plan FILE --output-dir DIRECTORY

The fetch stage records raw USGS 3DEP/NAVD88 evidence only. It never produces
accepted runtime ground. The compile stage requires a complete normalization
document bound to the raw file SHA-256 and declaring WGS84_G1674/EGM2008.
Use scripts/ground-datum-normalizer.py to prepare that document from separately
verified, raster-specific source attestations.

The Copernicus command reads only the public unsigned AWS distribution. It
records source-object hashes, preserves the source DSM samples separately from
the classified ground product, and never calls a permission-gated view service.
`.trim();
}

async function commandPlan() {
  const plan = createGroundBuildPlan({
    districtId: requiredFlag('--district-id'),
    centerLatitude: numberFlag('--center-lat'),
    centerLongitude: numberFlag('--center-lon'),
    widthMeters: numberFlag('--width-m'),
    heightMeters: numberFlag('--height-m'),
    spacingMeters: numberFlag('--spacing-m'),
    maxSamples: numberFlag('--max-samples', 250000)
  });
  const output = await writeJson(requiredFlag('--output'), plan);
  return {
    ok: true,
    command: 'plan',
    output,
    districtId: plan.districtId,
    partCount: plan.partCount,
    sampleCount: plan.sampleCount,
    crossesAntimeridian: plan.crossesAntimeridian
  };
}

function assertPlan(plan) {
  if (Number(plan?.schemaVersion) !== 1 ||
      !Array.isArray(plan?.parts) ||
      plan.parts.length === 0) {
    throw new Error('ground build plan is invalid');
  }
  for (const part of plan.parts) {
    if (!Array.isArray(part?.points) ||
        part.points.length !== Number(part?.grid?.sampleCount)) {
      throw new Error(`ground build plan part ${part?.id || 'unknown'} is incomplete`);
    }
  }
  const expected = createGroundBuildPlan({
    districtId: plan.districtId,
    centerLatitude: plan.center?.latitude,
    centerLongitude: plan.center?.longitude,
    widthMeters: plan.requestedExtentMeters?.widthMeters,
    heightMeters: plan.requestedExtentMeters?.heightMeters,
    spacingMeters: plan.spacingMeters,
    maxSamples: plan.maxSamples
  });
  if (canonicalJson(plan) !== canonicalJson(expected)) {
    throw new Error('ground build plan is not canonical or has been altered');
  }
}

async function commandFetchUsgs() {
  const { value: plan } = await readJson(requiredFlag('--plan'));
  assertPlan(plan);
  const batchSize = numberFlag('--batch-size', 200);
  const concurrency = Math.max(
    1,
    Math.min(8, Math.floor(numberFlag('--concurrency', 6)))
  );
  const batches = plan.parts.flatMap((part) =>
    chunkGroundPoints(part.points, batchSize)
  );
  const results = new Array(batches.length);
  let nextBatch = 0;
  const worker = async () => {
    while (nextBatch < batches.length) {
      const index = nextBatch++;
      results[index] = await fetchUsgs3depSamples({
        points: batches[index]
      });
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, batches.length) },
      () => worker()
    )
  );
  const samples = results.flat();
  const releases = [...new Set(samples.map((sample) => sample.sourceRelease))]
    .filter(Boolean)
    .sort();
  const rawDocument = {
    schemaVersion: 1,
    type: 'GroundRawSampleSet',
    status: 'raw-not-runtime-ground',
    providerId: 'usgs-3dep-best-available',
    sourceHorizontalFrame: 'NAD83',
    sourceVerticalDatum: 'NAVD88',
    targetVerticalDatum: plan.targetVerticalDatum,
    plan,
    sampleCount: samples.length,
    sourceReleases: releases,
    samples
  };
  const output = await writeJson(requiredFlag('--output'), rawDocument);
  const rawText = canonicalJson(rawDocument);
  const normalizationRequest = {
    schemaVersion: 1,
    type: 'GroundNormalizationRequest',
    sourceContentSha256: sha256(rawText),
    sourceHorizontalFrame: rawDocument.sourceHorizontalFrame,
    sourceVerticalDatum: rawDocument.sourceVerticalDatum,
    targetHorizontalFrame: 'WGS84_G1674',
    targetVerticalDatum: 'EGM2008',
    sampleCount: samples.length,
    samples: samples.map((sample) => ({
      key: sample.key,
      latitude: sample.latitude,
      longitude: sample.longitude,
      elevationMeters: sample.rawElevationMeters,
      rasterId: sample.rasterId,
      sourceRelease: sample.sourceRelease,
      acquisitionStartDate: sample.acquisitionStartDate,
      acquisitionEndDate: sample.acquisitionEndDate
    }))
  };
  const requestOutput = await writeJson(
    `${output}.normalization-request.json`,
    normalizationRequest
  );
  return {
    ok: true,
    command: 'fetch-usgs',
    output,
    normalizationRequest: requestOutput,
    sourceContentSha256: normalizationRequest.sourceContentSha256,
    sampleCount: samples.length,
    sourceReleases: releases
  };
}

function requireSourceTemplate(template) {
  if (
    template?.schemaVersion !== 1 ||
    template?.type !== 'GroundSourceAttestationTemplate' ||
    !Array.isArray(template.rasters) ||
    template.rasters.length !== 1
  ) {
    throw new Error(
      'USGS mosaic export requires one reviewed source attestation'
    );
  }
  const source = template.rasters[0];
  for (const field of [
    'rasterId',
    'sourceRelease',
    'sourceTitle',
    'acquisitionStartDate',
    'acquisitionEndDate'
  ]) {
    if (!String(source[field] || '')) {
      throw new Error(`source attestation is missing ${field}`);
    }
  }
  if (!Number.isFinite(Number(source.sourceResolutionMeters))) {
    throw new Error('source attestation is missing sourceResolutionMeters');
  }
  const lockedRasterIds = Array.isArray(source.lockedRasterIds)
    ? source.lockedRasterIds.map(Number)
    : [];
  if (lockedRasterIds.length > 0 && (
    lockedRasterIds.some((value) => !Number.isInteger(value) || value <= 0) ||
    new Set(lockedRasterIds).size !== lockedRasterIds.length
  )) {
    throw new Error('source attestation has invalid lockedRasterIds');
  }
  if (lockedRasterIds.length > 0) {
    const members = Array.isArray(source.sourceMembers)
      ? source.sourceMembers
      : [];
    if (members.length !== lockedRasterIds.length) {
      throw new Error('locked mosaic must attest every source member');
    }
    const memberIds = new Set();
    for (const member of members) {
      const objectId = Number(member?.objectId);
      if (!lockedRasterIds.includes(objectId) || memberIds.has(objectId)) {
        throw new Error('locked mosaic source member identity is invalid');
      }
      memberIds.add(objectId);
      for (const field of [
        'sourceRelease', 'sourceTitle', 'sourceUrl', 'metadataUrl',
        'metadataSha256'
      ]) {
        if (!String(member?.[field] || '')) {
          throw new Error(`locked mosaic source member is missing ${field}`);
        }
      }
      if (!/^[a-f0-9]{64}$/i.test(String(member.metadataSha256))) {
        throw new Error('locked mosaic source member metadata hash is invalid');
      }
    }
  }
  return source;
}

async function commandFetchUsgsExport() {
  const [{ value: plan }, { value: sourceTemplate }] = await Promise.all([
    readJson(requiredFlag('--plan')),
    readJson(requiredFlag('--source-template'))
  ]);
  assertPlan(plan);
  const source = requireSourceTemplate(sourceTemplate);
  const exportSpacingMeters = numberFlag('--export-spacing-m', 5);
  if (!(exportSpacingMeters > 0)) {
    throw new Error('--export-spacing-m must be positive');
  }
  const samples = [];
  const exports = [];
  for (const part of plan.parts) {
    const { grid } = part;
    const columnStep = grid.spacingMeters / exportSpacingMeters;
    if (!Number.isInteger(columnStep) || columnStep < 1) {
      throw new Error(
        'plan spacing must be an integer multiple of export spacing'
      );
    }
    const width =
      (grid.maxColumn - grid.minColumn) * columnStep + 1;
    const height =
      (grid.maxRow - grid.minRow) * columnStep + 1;
    const halfSpacing = exportSpacingMeters / 2;
    const bbox = [
      grid.minColumn * grid.spacingMeters - halfSpacing,
      grid.minRow * grid.spacingMeters - halfSpacing,
      grid.maxColumn * grid.spacingMeters + halfSpacing,
      grid.maxRow * grid.spacingMeters + halfSpacing
    ];
    const parameters = new URLSearchParams({
      f: 'json',
      bbox: bbox.join(','),
      bboxSR: '3857',
      imageSR: '3857',
      size: `${width},${height}`,
      format: 'tiff',
      pixelType: 'F32',
      interpolation: 'RSP_NearestNeighbor',
      adjustAspectRatio: 'false'
    });
    const lockedRasterIds = Array.isArray(source.lockedRasterIds)
      ? source.lockedRasterIds.map(Number)
      : [];
    if (lockedRasterIds.length > 0) {
      parameters.set('mosaicRule', JSON.stringify({
        mosaicMethod: 'esriMosaicLockRaster',
        lockRasterIds: lockedRasterIds,
        mosaicOperation: 'MT_FIRST'
      }));
    }
    const response = await fetch(
      `${USGS_3DEP_EXPORT_URL}?${parameters}`
    );
    if (!response.ok) {
      throw new Error(
        `USGS 3DEP export failed with HTTP ${response.status}`
      );
    }
    const exportResult = await response.json();
    if (
      !String(exportResult?.href || '').startsWith('https://') ||
      Number(exportResult?.width) !== width ||
      Number(exportResult?.height) !== height
    ) {
      throw new Error('USGS 3DEP export response is invalid');
    }
    const imageResponse = await fetch(exportResult.href);
    if (!imageResponse.ok) {
      throw new Error(
        `USGS 3DEP TIFF failed with HTTP ${imageResponse.status}`
      );
    }
    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
    const decoded = decodeUncompressedFloat32Tiff(imageBytes);
    if (decoded.width !== width || decoded.height !== height) {
      throw new Error('USGS 3DEP TIFF dimensions do not match the plan');
    }
    const exportContentSha256 = sha256(imageBytes);
    exports.push({
      partId: part.id,
      request: {
        endpoint: USGS_3DEP_EXPORT_URL,
        bbox,
        bboxSR: 3857,
        imageSR: 3857,
        width,
        height,
        exportSpacingMeters,
        format: 'tiff',
        pixelType: 'F32',
        interpolation: 'RSP_NearestNeighbor'
      },
      exportContentSha256,
      sourceAuthority: lockedRasterIds.length > 0
        ? {
            mode: 'locked-raster-mosaic',
            lockedRasterIds,
            sourceMembers: source.sourceMembers
          }
        : { mode: 'reviewed-mosaic-service' }
    });
    for (const point of part.points) {
      const columnIndex =
        (point.column - grid.minColumn) * columnStep;
      const southRowIndex =
        (point.row - grid.minRow) * columnStep;
      const imageRowIndex = height - 1 - southRowIndex;
      const rawElevationMeters =
        decoded.values[imageRowIndex * width + columnIndex];
      if (!Number.isFinite(rawElevationMeters)) {
        throw new Error(`USGS 3DEP export has no value for ${point.key}`);
      }
      samples.push({
        schemaVersion: 1,
        key: point.key,
        column: point.column,
        row: point.row,
        latitude: point.latitude,
        longitude: point.longitude,
        rawElevationMeters,
        sourceHorizontalFrame: 'NAD83',
        sourceVerticalDatum: 'NAVD88',
        sourceResolutionMeters: Number(source.sourceResolutionMeters),
        rasterId: String(source.rasterId),
        sourceProduct: 'USGS_3DEP',
        sourceTitle: String(source.sourceTitle),
        sourceRelease: String(source.sourceRelease),
        acquisitionStartDate: String(source.acquisitionStartDate),
        acquisitionEndDate: String(source.acquisitionEndDate)
      });
    }
  }
  const rawDocument = {
    schemaVersion: 1,
    type: 'GroundRawSampleSet',
    status: 'raw-not-runtime-ground',
    providerId: 'usgs-3dep-best-available',
    sourceHorizontalFrame: 'NAD83',
    sourceVerticalDatum: 'NAVD88',
    targetVerticalDatum: plan.targetVerticalDatum,
    plan,
    sampleCount: samples.length,
    sourceReleases: [String(source.sourceRelease)],
    sourceExports: exports,
    samples
  };
  const output = await writeJson(requiredFlag('--output'), rawDocument);
  const rawText = canonicalJson(rawDocument);
  const normalizationRequest = {
    schemaVersion: 1,
    type: 'GroundNormalizationRequest',
    sourceContentSha256: sha256(rawText),
    sourceHorizontalFrame: rawDocument.sourceHorizontalFrame,
    sourceVerticalDatum: rawDocument.sourceVerticalDatum,
    targetHorizontalFrame: 'WGS84_G1674',
    targetVerticalDatum: 'EGM2008',
    sampleCount: samples.length,
    samples: samples.map((sample) => ({
      key: sample.key,
      latitude: sample.latitude,
      longitude: sample.longitude,
      elevationMeters: sample.rawElevationMeters,
      rasterId: sample.rasterId,
      sourceRelease: sample.sourceRelease,
      acquisitionStartDate: sample.acquisitionStartDate,
      acquisitionEndDate: sample.acquisitionEndDate
    }))
  };
  const requestOutput = await writeJson(
    `${output}.normalization-request.json`,
    normalizationRequest
  );
  return {
    ok: true,
    command: 'fetch-usgs-export',
    output,
    normalizationRequest: requestOutput,
    sourceContentSha256: normalizationRequest.sourceContentSha256,
    sampleCount: samples.length,
    exportContentSha256: exports.map((entry) =>
      entry.exportContentSha256)
  };
}

function validateNormalizationDocument(document, rawText, rawSamples) {
  const reasons = [];
  if (Number(document?.schemaVersion) !== 1) reasons.push('unsupported-schema');
  if (document?.complete !== true) reasons.push('normalization-incomplete');
  if (String(document?.sourceContentSha256 || '') !== sha256(rawText)) {
    reasons.push('raw-content-hash-mismatch');
  }
  if (String(document?.targetHorizontalFrame || '') !== 'WGS84_G1674') {
    reasons.push('wrong-target-horizontal-frame');
  }
  if (String(document?.targetVerticalDatum || '') !== 'EGM2008') {
    reasons.push('wrong-target-vertical-datum');
  }
  if (!String(document?.normalizer?.name || '')) reasons.push('missing-normalizer');
  if (!String(document?.normalizer?.version || '')) {
    reasons.push('missing-normalizer-version');
  }
  if (!/^[a-f0-9]{64}$/i.test(String(document?.normalizer?.datasetSha256 || ''))) {
    reasons.push('invalid-normalization-dataset-hash');
  }
  const outputs = Array.isArray(document?.samples) ? document.samples : [];
  if (outputs.length !== rawSamples.length) reasons.push('sample-count-mismatch');
  const byKey = new Map();
  for (const output of outputs) {
    const key = String(output?.key || '');
    if (!key || byKey.has(key)) {
      reasons.push('duplicate-or-missing-sample-key');
      continue;
    }
    byKey.set(key, output);
  }
  for (const raw of rawSamples) {
    if (!byKey.has(raw.key)) reasons.push(`missing-sample:${raw.key}`);
  }
  if (reasons.length > 0) {
    throw new Error(`normalization document rejected: ${[...new Set(reasons)].join(',')}`);
  }
  return byKey;
}

async function commandCompile() {
  const rawPath = requiredFlag('--raw');
  const normalizationPath = requiredFlag('--normalization');
  const outputDirectory = path.resolve(requiredFlag('--output-dir'));
  const [{ text: rawText, value: raw }, { value: normalization }] =
    await Promise.all([readJson(rawPath), readJson(normalizationPath)]);
  assertPlan(raw.plan);
  if (raw?.type !== 'GroundRawSampleSet' ||
      raw?.status !== 'raw-not-runtime-ground' ||
      raw?.providerId !== 'usgs-3dep-best-available' ||
      raw?.sourceHorizontalFrame !== 'NAD83' ||
      raw?.sourceVerticalDatum !== 'NAVD88' ||
      raw?.targetVerticalDatum !== 'EGM2008' ||
      !Array.isArray(raw?.sourceReleases) ||
      raw.sourceReleases.length === 0 ||
      raw.sourceReleases.some((release) => !String(release || '')) ||
      !Array.isArray(raw?.samples) ||
      raw.samples.length !== Number(raw.sampleCount)) {
    throw new Error('raw sample document is invalid');
  }
  const normalizedByKey = validateNormalizationDocument(
    normalization,
    rawText,
    raw.samples
  );
  const method =
    `${normalization.normalizer.name}@${normalization.normalizer.version}:` +
    normalization.normalizer.datasetSha256.slice(0, 16);
  const normalizedSamples = await normalizeGroundSamples({
    rawSamples: raw.samples,
    maximumUncertaintyMeters: numberFlag('--max-uncertainty-m', 1),
    normalizeSample: async (sample) => ({
      ...normalizedByKey.get(sample.key),
      horizontalFrame: normalization.targetHorizontalFrame,
      verticalDatum: normalization.targetVerticalDatum,
      method
    })
  });
  const normalizedSampleByKey = new Map(raw.samples.map((sample, index) => [
    sample.key,
    normalizedSamples[index]
  ]));
  const sourceRelease = `USGS-3DEP:${raw.sourceReleases.join('+') || 'unknown'}`;
  const outputs = [];
  for (const part of raw.plan.parts) {
    const partSamples = part.points.map((point) => {
      const normalizedSample = normalizedSampleByKey.get(point.key);
      if (!normalizedSample) {
        throw new Error(`normalized sample is missing for ${point.key}`);
      }
      return normalizedSample;
    });
    const artifactId = raw.plan.partCount === 1
      ? `${raw.plan.districtId}-ground`
      : `${part.id}-ground`;
    const bundle = createGroundArtifactBundle({
      artifactId,
      part,
      sourceRelease,
      normalizedSamples: partSamples,
      sourceEvidence: {
        sourceClassification: 'bare-earth-dem',
        acquisitionMode: Array.isArray(raw.sourceExports)
          ? 'bounded-image-service-export'
          : 'bounded-point-samples',
        sourceContentSha256: sha256(rawText),
        sourceExports: Array.isArray(raw.sourceExports)
          ? raw.sourceExports
          : [],
        normalizer: {
          name: normalization.normalizer.name,
          version: normalization.normalizer.version,
          pyprojVersion: normalization.normalizer.pyprojVersion,
          projVersion: normalization.normalizer.projVersion,
          datasetSha256: normalization.normalizer.datasetSha256,
          operationSha256: normalization.normalizer.operationSha256,
          grids: (normalization.normalizer.grids || []).map((grid) => ({
            id: grid.id,
            sha256: grid.sha256
          })),
          uncertaintyPolicy: normalization.normalizer.uncertaintyPolicy
        }
      },
      compactArtifact: true
    });
    const partDirectory = raw.plan.partCount === 1
      ? outputDirectory
      : path.join(outputDirectory, part.id);
    const artifactPath = await writeText(
      path.join(partDirectory, 'ground-artifact.json'),
      bundle.artifactText
    );
    const manifestPath = await writeJson(
      path.join(partDirectory, 'ground-manifest.json'),
      bundle.manifest
    );
    outputs.push({
      artifactId,
      artifactPath,
      manifestPath,
      contentSha256: bundle.manifest.contentSha256,
      sampleCount: bundle.compiled.model.grid.sampleCount
    });
  }
  return {
    ok: true,
    command: 'compile',
    providerId: raw.providerId,
    sourceRelease,
    normalizer: method,
    outputCount: outputs.length,
    outputs
  };
}

async function commandCompileCopernicus() {
  const { value: plan } = await readJson(requiredFlag('--plan'));
  assertPlan(plan);
  const outputDirectory = path.resolve(requiredFlag('--output-dir'));
  const outputs = [];
  for (const part of plan.parts) {
    const built = await buildCopernicusGroundSamples({ part });
    const artifactId = plan.partCount === 1
      ? `${plan.districtId}-ground`
      : `${part.id}-ground`;
    const bundle = createGroundArtifactBundle({
      artifactId,
      part,
      sourceRelease: built.sourceRelease,
      normalizedSamples: built.samples,
      providerId: 'copernicus-dem-classified-ground-v1',
      licenseAttested: true,
      correctionAttested: true,
      sourceEvidence: {
        sourceClassification: 'digital-surface-model',
        correctionMethod: built.classification.method,
        sourceTiles: built.sourceTiles
      },
      attribution: {
        notice: [...new Set(built.sourceTiles.map((tile) =>
          tile.resolutionMeters === 30
            ? COPERNICUS_DEM_ATTRIBUTION
            : COPERNICUS_DEM_90_ATTRIBUTION
        ))].join(' '),
        liabilityNotice: [...new Set(built.sourceTiles.map((tile) =>
          tile.resolutionMeters === 30
            ? COPERNICUS_DEM_LIABILITY_NOTICE
            : COPERNICUS_DEM_90_LIABILITY_NOTICE
        ))].join(' '),
        licenseDocument: COPERNICUS_DEM_LICENSE_DOCUMENT,
        modified: true
      },
      compactArtifact: true
    });
    const partDirectory = plan.partCount === 1
      ? outputDirectory
      : path.join(outputDirectory, part.id);
    const artifactPath = await writeText(
      path.join(partDirectory, 'ground-artifact.json'),
      bundle.artifactText
    );
    const manifestPath = await writeJson(
      path.join(partDirectory, 'ground-manifest.json'),
      bundle.manifest
    );
    outputs.push({
      artifactId,
      artifactPath,
      manifestPath,
      contentSha256: bundle.manifest.contentSha256,
      sampleCount: bundle.compiled.model.grid.sampleCount,
      classification: built.classification,
      sourceTiles: built.sourceTiles
    });
  }
  return {
    ok: true,
    command: 'compile-copernicus',
    providerId: 'copernicus-dem-classified-ground-v1',
    outputCount: outputs.length,
    outputs
  };
}

const command = process.argv[2] || 'help';
try {
  let result;
  if (command === 'plan') result = await commandPlan();
  else if (command === 'fetch-usgs') result = await commandFetchUsgs();
  else if (command === 'fetch-usgs-export') {
    result = await commandFetchUsgsExport();
  }
  else if (command === 'compile') result = await commandCompile();
  else if (command === 'compile-copernicus') {
    result = await commandCompileCopernicus();
  }
  else {
    console.log(help());
    process.exit(command === 'help' || command === '--help' ? 0 : 1);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    command,
    error: String(error?.message || error)
  }, null, 2));
  process.exit(1);
}

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

function help() {
  return `
WorldExplorer3D accepted-ground artifact builder

Commands:
  plan
    --district-id ID --center-lat LAT --center-lon LON
    --width-m M --height-m M --spacing-m M --output FILE

  fetch-usgs
    --plan FILE --output FILE [--batch-size 500]

  compile
    --raw FILE --normalization FILE --output-dir DIRECTORY

The fetch stage records raw USGS 3DEP/NAVD88 evidence only. It never produces
accepted runtime ground. The compile stage requires a complete normalization
document bound to the raw file SHA-256 and declaring WGS84_G1674/EGM2008.
Use scripts/ground-datum-normalizer.py to prepare that document from separately
verified, raster-specific source attestations.
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
  const batchSize = numberFlag('--batch-size', 500);
  const samples = [];
  for (const part of plan.parts) {
    for (const batch of chunkGroundPoints(part.points, batchSize)) {
      samples.push(...await fetchUsgs3depSamples({ points: batch }));
    }
  }
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
      normalizedSamples: partSamples
    });
    const partDirectory = raw.plan.partCount === 1
      ? outputDirectory
      : path.join(outputDirectory, part.id);
    const artifactPath = await writeJson(
      path.join(partDirectory, 'ground-artifact.json'),
      bundle.artifact
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

const command = process.argv[2] || 'help';
try {
  let result;
  if (command === 'plan') result = await commandPlan();
  else if (command === 'fetch-usgs') result = await commandFetchUsgs();
  else if (command === 'compile') result = await commandCompile();
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

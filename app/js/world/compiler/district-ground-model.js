// Pure logical-ground compiler. Samples are addressed on a global Web
// Mercator metre grid so independently compiled neighboring districts share
// the same edge keys. Renderer meshes are not source data.

const ALLOWED_SOURCE_CLASSIFICATIONS = new Set([
  'accepted-ground',
  'correctable-surface',
  'rejected'
]);
export const DISTRICT_GROUND_MODEL_SCHEMA_VERSION = 1;

function assertFinite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
}

function sampleKey(column, row) {
  return `${column}:${row}`;
}

function freezeSample(sample) {
  return Object.freeze({
    key: sampleKey(sample.column, sample.row),
    column: sample.column,
    row: sample.row,
    eastingMeters: sample.eastingMeters,
    northingMeters: sample.northingMeters,
    rawElevationMeters: sample.rawElevationMeters,
    groundElevationMeters: sample.groundElevationMeters,
    confidence: sample.confidence,
    correctionReason: sample.correctionReason,
    provenance: String(sample.provenance || 'unknown')
  });
}

function rejection(reason, diagnostics) {
  return Object.freeze({
    type: 'DistrictGroundModel',
    schemaVersion: DISTRICT_GROUND_MODEL_SCHEMA_VERSION,
    status: 'rejected',
    reason,
    diagnostics: Object.freeze(diagnostics)
  });
}

export function compileDistrictGroundModel(options = {}) {
  const districtId = String(options.districtId || '');
  const spacingMeters = Number(options.grid?.spacingMeters);
  const minColumn = Number(options.grid?.minColumn);
  const maxColumn = Number(options.grid?.maxColumn);
  const minRow = Number(options.grid?.minRow);
  const maxRow = Number(options.grid?.maxRow);
  const minimumConfidence = Number(options.minimumConfidence ?? 0.75);
  const sourceClassification = String(
    options.sourceClassification || 'rejected'
  );

  assertFinite(spacingMeters, 'grid spacing');
  if (spacingMeters <= 0) throw new RangeError('grid spacing must be positive');
  for (const [value, label] of [
    [minColumn, 'minimum column'],
    [maxColumn, 'maximum column'],
    [minRow, 'minimum row'],
    [maxRow, 'maximum row']
  ]) {
    if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer`);
  }
  if (maxColumn < minColumn || maxRow < minRow) {
    throw new RangeError('grid bounds are inverted');
  }
  if (!ALLOWED_SOURCE_CLASSIFICATIONS.has(sourceClassification)) {
    throw new TypeError('source classification is invalid');
  }

  const expectedCount =
    (maxColumn - minColumn + 1) * (maxRow - minRow + 1);
  const inputSamples = Array.isArray(options.samples) ? options.samples : [];
  const byKey = new Map();
  for (const input of inputSamples) {
    const column = Number(input?.column);
    const row = Number(input?.row);
    if (!Number.isInteger(column) || !Number.isInteger(row)) {
      return rejection('invalid-grid-address', {
        districtId,
        expectedCount,
        receivedCount: inputSamples.length
      });
    }
    const key = sampleKey(column, row);
    if (byKey.has(key)) {
      return rejection('duplicate-grid-address', {
        districtId,
        duplicateKey: key,
        expectedCount,
        receivedCount: inputSamples.length
      });
    }
    byKey.set(key, input);
  }

  if (sourceClassification === 'rejected') {
    return rejection('source-rejected', {
      districtId,
      expectedCount,
      receivedCount: byKey.size
    });
  }
  if (
    sourceClassification === 'correctable-surface' &&
    options.approvedCorrection !== true
  ) {
    return rejection('ground-correction-not-approved', {
      districtId,
      expectedCount,
      receivedCount: byKey.size
    });
  }

  const samples = [];
  const missingKeys = [];
  const lowConfidenceKeys = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      const key = sampleKey(column, row);
      const input = byKey.get(key);
      const rawElevationMeters = Number(input?.rawElevationMeters);
      const groundElevationMeters = Number(input?.groundElevationMeters);
      const confidence = Number(input?.confidence);
      if (
        !input ||
        input.available !== true ||
        !Number.isFinite(rawElevationMeters) ||
        !Number.isFinite(groundElevationMeters)
      ) {
        missingKeys.push(key);
        continue;
      }
      if (!Number.isFinite(confidence) || confidence < minimumConfidence) {
        lowConfidenceKeys.push(key);
        continue;
      }
      samples.push(freezeSample({
        column,
        row,
        eastingMeters: column * spacingMeters,
        northingMeters: row * spacingMeters,
        rawElevationMeters,
        groundElevationMeters,
        confidence,
        correctionReason: String(input.correctionReason || 'none'),
        provenance: input.provenance
      }));
    }
  }

  if (missingKeys.length > 0 || lowConfidenceKeys.length > 0) {
    return rejection(
      missingKeys.length > 0 ? 'incomplete-coverage' : 'insufficient-confidence',
      {
        districtId,
        expectedCount,
        receivedCount: byKey.size,
        acceptedCount: samples.length,
        missingKeys: Object.freeze(missingKeys),
        lowConfidenceKeys: Object.freeze(lowConfidenceKeys)
      }
    );
  }

  const samplesByKey = Object.freeze(Object.fromEntries(
    samples.map((sample) => [sample.key, sample])
  ));
  return Object.freeze({
    type: 'DistrictGroundModel',
    schemaVersion: DISTRICT_GROUND_MODEL_SCHEMA_VERSION,
    status: 'accepted',
    districtId,
    sourceClassification,
    verticalDatum: String(options.verticalDatum || 'unknown'),
    grid: Object.freeze({
      crs: 'EPSG:3857',
      spacingMeters,
      minColumn,
      maxColumn,
      minRow,
      maxRow,
      sampleCount: expectedCount
    }),
    minimumConfidence,
    samples: Object.freeze(samples),
    samplesByKey,
    diagnostics: Object.freeze({
      expectedCount,
      receivedCount: byKey.size,
      acceptedCount: samples.length,
      rawGroundProductsSeparated: samples.every((sample) =>
        Number.isFinite(sample.rawElevationMeters) &&
        Number.isFinite(sample.groundElevationMeters)
      )
    })
  });
}

export function sampleDistrictGroundMeters(model, eastingMeters, northingMeters) {
  if (model?.type !== 'DistrictGroundModel' || model.status !== 'accepted') {
    return Object.freeze({ status: 'unavailable', reason: 'model-not-accepted' });
  }
  assertFinite(eastingMeters, 'easting');
  assertFinite(northingMeters, 'northing');
  const { spacingMeters, minColumn, maxColumn, minRow, maxRow } = model.grid;
  const columnFloat = eastingMeters / spacingMeters;
  const rowFloat = northingMeters / spacingMeters;
  const column0 = Math.floor(columnFloat);
  const row0 = Math.floor(rowFloat);
  const column1 = Math.min(maxColumn, column0 + 1);
  const row1 = Math.min(maxRow, row0 + 1);
  if (
    column0 < minColumn ||
    column0 > maxColumn ||
    row0 < minRow ||
    row0 > maxRow
  ) {
    return Object.freeze({ status: 'unavailable', reason: 'outside-model' });
  }

  const samples = [
    model.samplesByKey[sampleKey(column0, row0)],
    model.samplesByKey[sampleKey(column1, row0)],
    model.samplesByKey[sampleKey(column0, row1)],
    model.samplesByKey[sampleKey(column1, row1)]
  ];
  if (samples.some((sample) => !sample)) {
    return Object.freeze({ status: 'unavailable', reason: 'missing-cell' });
  }
  const xBlend = column1 === column0 ? 0 : columnFloat - column0;
  const yBlend = row1 === row0 ? 0 : rowFloat - row0;
  const interpolate = (field) => {
    const north0 = samples[0][field] +
      (samples[1][field] - samples[0][field]) * xBlend;
    const north1 = samples[2][field] +
      (samples[3][field] - samples[2][field]) * xBlend;
    return north0 + (north1 - north0) * yBlend;
  };

  return Object.freeze({
    status: 'available',
    groundElevationMeters: interpolate('groundElevationMeters'),
    rawElevationMeters: interpolate('rawElevationMeters'),
    confidence: Math.min(...samples.map((sample) => sample.confidence)),
    sampleKeys: Object.freeze(samples.map((sample) => sample.key))
  });
}

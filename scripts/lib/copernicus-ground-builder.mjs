import crypto from 'node:crypto';
import { fromArrayBuffer } from 'geotiff';
import {
  WEB_MERCATOR_RADIUS_METERS,
  normalizeLongitude
} from '../../app/js/terrain/source-contract.js';

export const COPERNICUS_DEM_PRODUCT_RELEASE = 'COP-DEM-2021';
export const COPERNICUS_DEM_LICENSE_DOCUMENT =
  'https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/' +
  'copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf';
export const COPERNICUS_DEM_ATTRIBUTION =
  'produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and ' +
  '© Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS ' +
  'by the European Union and ESA; all rights reserved.';
export const COPERNICUS_DEM_90_ATTRIBUTION =
  'produced using Copernicus WorldDEM™-90 © DLR e.V. 2010-2014 and ' +
  '© Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS ' +
  'by the European Union and ESA; all rights reserved.';
export const COPERNICUS_DEM_LIABILITY_NOTICE =
  'The organisations in charge of the Copernicus programme by law or by ' +
  'delegation do not incur any liability for any use of the Copernicus ' +
  'WorldDEM-30.';
export const COPERNICUS_DEM_90_LIABILITY_NOTICE =
  'The organisations in charge of the Copernicus programme by law or by ' +
  'delegation do not incur any liability for any use of the Copernicus ' +
  'WorldDEM™-90.';

const NODATA = -32767;
const FILTER_RADII = Object.freeze([1, 2, 3, 4, 5, 6]);
const FILTER_VERSION = 'worldexplorer-pmf-grid-v2';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function coordinateToken(value, positive, negative) {
  const direction = value >= 0 ? positive : negative;
  return `${direction}${String(Math.abs(value)).padStart(2, '0')}`;
}

export function copernicusTileDescriptor(latitude, longitude, resolution = 30) {
  const south = Math.floor(Number(latitude));
  const west = Math.floor(normalizeLongitude(Number(longitude)));
  const arcSeconds = resolution === 30 ? 10 : 30;
  const latitudeToken = coordinateToken(south, 'N', 'S');
  const longitudeDirection = west >= 0 ? 'E' : 'W';
  const longitudeToken =
    `${longitudeDirection}${String(Math.abs(west)).padStart(3, '0')}`;
  const tileId =
    `Copernicus_DSM_COG_${arcSeconds}_${latitudeToken}_00_` +
    `${longitudeToken}_00_DEM`;
  return Object.freeze({
    tileId,
    resolutionMeters: resolution,
    south,
    north: south + 1,
    west,
    east: west + 1,
    url: `https://copernicus-dem-${resolution}m.s3.amazonaws.com/` +
      `${tileId}/${tileId}.tif`
  });
}

async function fetchTile(descriptor, fetchImpl) {
  const response = await fetchImpl(descriptor.url, { cache: 'no-store' });
  if (!response.ok) {
    return response.status === 404 ? null : Promise.reject(new Error(
      `Copernicus DEM tile ${descriptor.tileId} failed with HTTP ` +
      `${response.status}`
    ));
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const tiff = await fromArrayBuffer(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );
  const image = await tiff.getImage();
  const values = await image.readRasters({ interleave: true });
  const boundingBox = image.getBoundingBox();
  if (
    values.length !== image.getWidth() * image.getHeight() ||
    !Array.isArray(boundingBox) ||
    boundingBox.length !== 4
  ) {
    throw new Error(`Copernicus DEM tile ${descriptor.tileId} is invalid`);
  }
  return Object.freeze({
    ...descriptor,
    width: image.getWidth(),
    height: image.getHeight(),
    boundingBox: Object.freeze(boundingBox.map(Number)),
    values,
    contentLength: bytes.byteLength,
    contentSha256: sha256(bytes),
    etag: String(response.headers.get('etag') || '').replaceAll('"', ''),
    lastModified: String(response.headers.get('last-modified') || '')
  });
}

async function loadBestPublicTile(latitude, longitude, fetchImpl) {
  const glo30 = copernicusTileDescriptor(latitude, longitude, 30);
  const publicGlo30 = await fetchTile(glo30, fetchImpl);
  if (publicGlo30) return publicGlo30;
  const glo90 = copernicusTileDescriptor(latitude, longitude, 90);
  const publicGlo90 = await fetchTile(glo90, fetchImpl);
  if (publicGlo90) return publicGlo90;
  throw new Error(
    `No public Copernicus DEM tile covers ${latitude},${longitude}`
  );
}

function geographicFromMercator(eastingMeters, northingMeters) {
  return {
    longitude: normalizeLongitude(
      eastingMeters / WEB_MERCATOR_RADIUS_METERS * 180 / Math.PI
    ),
    latitude: (
      2 * Math.atan(Math.exp(
        northingMeters / WEB_MERCATOR_RADIUS_METERS
      )) - Math.PI / 2
    ) * 180 / Math.PI
  };
}

function tileKey(latitude, longitude) {
  return `${Math.floor(latitude)}:${Math.floor(normalizeLongitude(longitude))}`;
}

function sampleTile(tile, latitude, longitude) {
  const [west, south, east, north] = tile.boundingBox;
  const x = (normalizeLongitude(longitude) - west) / (east - west) *
    tile.width - 0.5;
  const y = (north - latitude) / (north - south) * tile.height - 0.5;
  const x0 = Math.max(0, Math.min(tile.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(tile.height - 1, Math.floor(y)));
  const x1 = Math.max(0, Math.min(tile.width - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(tile.height - 1, y0 + 1));
  const tx = Math.max(0, Math.min(1, x - x0));
  const ty = Math.max(0, Math.min(1, y - y0));
  const values = [
    Number(tile.values[y0 * tile.width + x0]),
    Number(tile.values[y0 * tile.width + x1]),
    Number(tile.values[y1 * tile.width + x0]),
    Number(tile.values[y1 * tile.width + x1])
  ];
  if (values.some((value) => !Number.isFinite(value) || value <= NODATA)) {
    throw new Error(`Copernicus DEM nodata in ${tile.tileId}`);
  }
  return (
    values[0] * (1 - tx) * (1 - ty) +
    values[1] * tx * (1 - ty) +
    values[2] * (1 - tx) * ty +
    values[3] * tx * ty
  );
}

function boxFilter(values, width, height, radius, mode) {
  const output = new Float64Array(values.length);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      let selected = mode === 'minimum' ? Infinity : -Infinity;
      for (
        let y = Math.max(0, row - radius);
        y <= Math.min(height - 1, row + radius);
        y += 1
      ) {
        for (
          let x = Math.max(0, column - radius);
          x <= Math.min(width - 1, column + radius);
          x += 1
        ) {
          const value = values[y * width + x];
          selected = mode === 'minimum'
            ? Math.min(selected, value)
            : Math.max(selected, value);
        }
      }
      output[row * width + column] = selected;
    }
  }
  return output;
}

export function classifyCopernicusSurface({
  values,
  width,
  height,
  spacingMeters
}) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    values?.length !== width * height ||
    !(Number(spacingMeters) > 0)
  ) {
    throw new TypeError('a complete positive raster grid is required');
  }
  const raw = Float64Array.from(values, Number);
  if (raw.some((value) => !Number.isFinite(value))) {
    throw new Error('surface raster contains unavailable values');
  }
  const ground = Float64Array.from(raw);
  const removed = new Uint8Array(raw.length);
  const localRelief = new Float64Array(raw.length);
  const maximumNaturalTerrainStep = Number(spacingMeters) * 0.15;
  const classifiedSurfaceStep = Number(spacingMeters) * 0.05;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      const neighborDifferences = [];
      for (const [x, y] of [
        [column - 1, row],
        [column + 1, row],
        [column, row - 1],
        [column, row + 1]
      ]) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          neighborDifferences.push(
            Math.abs(raw[index] - raw[y * width + x])
          );
        }
      }
      neighborDifferences.sort((left, right) => left - right);
      const observedStep =
        neighborDifferences[Math.min(1, neighborDifferences.length - 1)] || 0;
      localRelief[index] = observedStep <= maximumNaturalTerrainStep
        ? observedStep
        : classifiedSurfaceStep;
    }
  }
  for (const radius of FILTER_RADII) {
    const erosion = boxFilter(raw, width, height, radius, 'minimum');
    const opening = boxFilter(erosion, width, height, radius, 'maximum');
    for (let index = 0; index < raw.length; index += 1) {
      const candidate = Math.min(ground[index], opening[index]);
      const threshold =
        2.5 +
        radius * Number(spacingMeters) * 0.015 +
        localRelief[index] * radius * 2;
      if (ground[index] - candidate > threshold) {
        ground[index] = candidate;
        removed[index] = 1;
      }
    }
  }
  return Object.freeze({
    method: FILTER_VERSION,
    ground,
    removed,
    removedCount: removed.reduce((total, value) => total + value, 0)
  });
}

export async function buildCopernicusGroundSamples({
  part,
  fetchImpl = globalThis.fetch
}) {
  if (!part?.grid || !Array.isArray(part?.points)) {
    throw new TypeError('a ground build plan part is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetch implementation is required');
  }
  const { grid } = part;
  const contextRadius = Math.max(...FILTER_RADII);
  const minColumn = grid.minColumn - contextRadius;
  const maxColumn = grid.maxColumn + contextRadius;
  const minRow = grid.minRow - contextRadius;
  const maxRow = grid.maxRow + contextRadius;
  const width = maxColumn - minColumn + 1;
  const height = maxRow - minRow + 1;
  const pointGrid = [];
  const requiredTiles = new Map();
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      const geographic = geographicFromMercator(
        column * grid.spacingMeters,
        row * grid.spacingMeters
      );
      pointGrid.push({ column, row, ...geographic });
      requiredTiles.set(
        tileKey(geographic.latitude, geographic.longitude),
        geographic
      );
    }
  }
  const tiles = new Map();
  for (const [key, geographic] of requiredTiles) {
    tiles.set(
      key,
      await loadBestPublicTile(
        geographic.latitude,
        geographic.longitude,
        fetchImpl
      )
    );
  }
  const rawValues = Float64Array.from(pointGrid, (point) =>
    sampleTile(
      tiles.get(tileKey(point.latitude, point.longitude)),
      point.latitude,
      point.longitude
    )
  );
  const classified = classifyCopernicusSurface({
    values: rawValues,
    width,
    height,
    spacingMeters: grid.spacingMeters
  });
  const samples = part.points.map((point) => {
    const index =
      (point.row - minRow) * width + (point.column - minColumn);
    const rawElevationMeters = rawValues[index];
    const groundElevationMeters = classified.ground[index];
    const correctionMeters = rawElevationMeters - groundElevationMeters;
    const uncertaintyMeters = Math.min(
      30,
      4 + Math.abs(correctionMeters) * 0.35
    );
    const sourceTile = tiles.get(tileKey(point.latitude, point.longitude));
    return Object.freeze({
      column: point.column,
      row: point.row,
      available: true,
      rawElevationMeters,
      groundElevationMeters,
      confidence: Math.max(0.75, 1 - uncertaintyMeters / 120),
      correctionReason: classified.removed[index]
        ? 'progressive-morphological-surface-classification'
        : 'surface-consistent-with-local-ground-envelope',
      provenance:
        `${sourceTile.tileId}:${sourceTile.contentSha256.slice(0, 16)}:` +
        `${FILTER_VERSION}:WGS84_G1150/EGM2008>WGS84_G1674/EGM2008`,
      normalizationUncertaintyMeters: uncertaintyMeters
    });
  });
  return Object.freeze({
    samples: Object.freeze(samples),
    sourceRelease:
      `${COPERNICUS_DEM_PRODUCT_RELEASE}:` +
      [...new Set([...tiles.values()].map((tile) =>
        `GLO-${tile.resolutionMeters}`
      ))].sort().join('+'),
    classification: Object.freeze({
      method: classified.method,
      removedSampleCount: samples.filter((sample) =>
        sample.correctionReason.startsWith('progressive-')
      ).length,
      sampleCount: samples.length
    }),
    sourceTiles: Object.freeze([...tiles.values()].map((tile) => Object.freeze({
      tileId: tile.tileId,
      url: tile.url,
      resolutionMeters: tile.resolutionMeters,
      contentLength: tile.contentLength,
      contentSha256: tile.contentSha256,
      etag: tile.etag,
      lastModified: tile.lastModified
    })))
  });
}

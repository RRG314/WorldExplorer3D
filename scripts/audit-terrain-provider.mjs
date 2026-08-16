import { chromium } from 'playwright';
import {
  TERRARIUM_SOURCE_FACTS,
  decodeTerrariumRgb,
  geographicToXyzTile,
  webMercatorGroundResolutionMeters
} from '../app/js/terrain/source-contract.js';

const TERRAIN_ZOOM = 15;
const baseControls = [
  { id: 'baltimore-urban', class: 'flat-urban', latitude: 39.2904, longitude: -76.6122, reference: 'usgs-3dep' },
  { id: 'sydney-urban', class: 'steep-urban', latitude: -33.8688, longitude: 151.2093, reference: 'ga-dem' },
  { id: 'iowa-rural', class: 'rural', latitude: 42.08, longitude: -93.87, reference: 'usgs-3dep' },
  { id: 'swiss-alps', class: 'mountain', latitude: 46.5763, longitude: 8.0053, reference: 'swisstopo-height' },
  { id: 'monaco-coast', class: 'coast', latitude: 43.7384, longitude: 7.4246, reference: 'ign-rge-alti' },
  { id: 'badwater-basin', class: 'below-sea-level', latitude: 36.2291, longitude: -116.7675, reference: 'usgs-3dep' },
  { id: 'reykjavik', class: 'high-latitude', latitude: 64.1466, longitude: -21.9426 },
  { id: 'antimeridian-east', class: 'antimeridian', latitude: 0, longitude: 179.999999 },
  {
    id: 'baltimore-tile-edge-west',
    class: 'tile-edge',
    diagnosticGroup: 'baltimore-tile-edge',
    latitude: 39.2904,
    longitude: -76.607666025625,
    reference: 'usgs-3dep'
  },
  {
    id: 'baltimore-tile-edge-east',
    class: 'tile-edge',
    diagnosticGroup: 'baltimore-tile-edge',
    latitude: 39.2904,
    longitude: -76.607666005625,
    reference: 'usgs-3dep'
  }
];
const sydneyGridCenter = { latitude: -33.8688, longitude: 151.2093 };
const sydneyGridOffsets = [-0.001, -0.0005, 0, 0.0005, 0.001];
const sydneyGridControls = sydneyGridOffsets.flatMap((latitudeOffset, row) =>
  sydneyGridOffsets.map((longitudeOffset, column) => ({
    id: `sydney-grid-${row}-${column}`,
    class: 'steep-urban-grid',
    diagnosticGroup: 'sydney-grid',
    latitude: sydneyGridCenter.latitude + latitudeOffset,
    longitude: sydneyGridCenter.longitude + longitudeOffset,
    reference: 'ga-dem'
  }))
).filter((control) =>
  control.latitude !== sydneyGridCenter.latitude ||
  control.longitude !== sydneyGridCenter.longitude
);
const controls = [...baseControls, ...sydneyGridControls];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

function interpolateDecodedNeighbors(neighbors, coordinate) {
  const decoded = neighbors.map((entry) => ({
    ...entry,
    meters: decodeTerrariumRgb(...entry.rgb)
  }));
  const x0 = Math.floor(coordinate.x);
  const y0 = Math.floor(coordinate.y);
  const xWeight = coordinate.x - x0;
  const yWeight = coordinate.y - y0;
  const valueAt = (x, y) => decoded.find(
    (entry) => entry.x === x && entry.y === y
  )?.meters;
  const northWest = valueAt(x0, y0);
  const northEast = valueAt(Math.ceil(coordinate.x), y0);
  const southWest = valueAt(x0, Math.ceil(coordinate.y));
  const southEast = valueAt(Math.ceil(coordinate.x), Math.ceil(coordinate.y));
  const north = northWest + (northEast - northWest) * xWeight;
  const south = southWest + (southEast - southWest) * xWeight;
  return {
    meters: north + (south - north) * yWeight,
    decoded
  };
}

async function authoritativeReference(control) {
  if (control.reference === 'usgs-3dep') {
    const url = new URL('https://epqs.nationalmap.gov/v1/json');
    url.search = new URLSearchParams({
      x: String(control.longitude),
      y: String(control.latitude),
      units: 'Meters',
      wkid: '4326',
      includeDate: 'false'
    });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`USGS EPQS failed with HTTP ${response.status}`);
    const payload = await response.json();
    return {
      service: 'USGS The National Map EPQS / 3DEP',
      url: url.toString(),
      elevationMeters: Number(payload.value),
      resolutionMeters: Number(payload.resolution),
      rasterId: payload.rasterId,
      datumStatus: 'source raster datum must be verified before strict error gating'
    };
  }
  if (control.reference === 'ga-dem') {
    const url = new URL(
      'https://services.ga.gov.au/gis/rest/services/' +
      'DEM_SRTM_1Second_2024/MapServer/identify'
    );
    url.search = new URLSearchParams({
      geometry: `${control.longitude},${control.latitude}`,
      geometryType: 'esriGeometryPoint',
      sr: '4326',
      layers: 'all:3',
      tolerance: '1',
      mapExtent:
        `${control.longitude - 0.01},${control.latitude - 0.01},` +
        `${control.longitude + 0.01},${control.latitude + 0.01}`,
      imageDisplay: '800,800,96',
      returnGeometry: 'false',
      f: 'json'
    });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GA DEM identify failed with HTTP ${response.status}`);
    const payload = await response.json();
    return {
      service: 'Geoscience Australia DEM SRTM 1 Second 2024',
      url: url.toString(),
      elevationMeters: Number(
        payload.results?.[0]?.attributes?.['Stretch.Pixel Value']
      ),
      resolutionMeters: 30,
      datumStatus: 'product vertical datum must be verified before strict error gating'
    };
  }
  if (control.reference === 'swisstopo-height') {
    const latitudeAux =
      (control.latitude * 3600 - 169028.66) / 10000;
    const longitudeAux =
      (control.longitude * 3600 - 26782.5) / 10000;
    const easting =
      2600072.37 +
      211455.93 * longitudeAux -
      10938.51 * longitudeAux * latitudeAux -
      0.36 * longitudeAux * latitudeAux ** 2 -
      44.54 * longitudeAux ** 3;
    const northing =
      1200147.07 +
      308807.95 * latitudeAux +
      3745.25 * longitudeAux ** 2 +
      76.63 * latitudeAux ** 2 -
      194.56 * longitudeAux ** 2 * latitudeAux +
      119.79 * latitudeAux ** 3;
    const url = new URL('https://api3.geo.admin.ch/rest/services/height');
    url.search = new URLSearchParams({
      easting: String(easting),
      northing: String(northing),
      sr: '2056'
    });
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`swisstopo height failed with HTTP ${response.status}`);
    }
    const payload = await response.json();
    return {
      service: 'swisstopo Federal Geoportal height service',
      url: url.toString(),
      elevationMeters: Number(payload.height),
      resolutionMeters: 2,
      datumStatus: 'Swiss height system compatibility with provider must be verified'
    };
  }
  if (control.reference === 'ign-rge-alti') {
    const url = new URL(
      'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json'
    );
    url.search = new URLSearchParams({
      lon: String(control.longitude),
      lat: String(control.latitude),
      resource: 'ign_rge_alti_wld',
      measures: 'true'
    });
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`IGN RGE ALTI failed with HTTP ${response.status}`);
    }
    const payload = await response.json();
    return {
      service: 'IGN Géoplateforme RGE ALTI',
      url: url.toString(),
      elevationMeters: Number(payload.elevations?.[0]?.z),
      resolutionMeters: 1,
      statedAccuracy: payload.elevations?.[0]?.acc ?? null,
      datumStatus: 'IGN vertical datum compatibility with provider must be verified'
    };
  }
  return {
    service: null,
    elevationMeters: null,
    resolutionMeters: null,
    datumStatus: 'authoritative reference not yet assigned'
  };
}

try {
  const results = [];
  for (const control of controls) {
    const tile = geographicToXyzTile(
      control.latitude,
      control.longitude,
      TERRAIN_ZOOM
    );
    const url =
      `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/` +
      `${tile.z}/${tile.x}/${tile.y}.png`;
    const pixels = await page.evaluate(async ({ url, xFraction, yFraction }) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`terrain request failed with HTTP ${response.status}`);
      }
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;

      function rgbAt(x, y) {
        const boundedX = Math.max(0, Math.min(bitmap.width - 1, x));
        const boundedY = Math.max(0, Math.min(bitmap.height - 1, y));
        const index = (boundedY * bitmap.width + boundedX) * 4;
        return [data[index], data[index + 1], data[index + 2]];
      }

      function neighborsAt(coordinate) {
        const x0 = Math.floor(coordinate.x);
        const y0 = Math.floor(coordinate.y);
        const x1 = Math.ceil(coordinate.x);
        const y1 = Math.ceil(coordinate.y);
        return [
          { x: x0, y: y0, rgb: rgbAt(x0, y0) },
          { x: x1, y: y0, rgb: rgbAt(x1, y0) },
          { x: x0, y: y1, rgb: rgbAt(x0, y1) },
          { x: x1, y: y1, rgb: rgbAt(x1, y1) }
        ];
      }

      const legacyX = xFraction * (bitmap.width - 1);
      const legacyY = yFraction * (bitmap.height - 1);
      const sourceX = xFraction * bitmap.width - 0.5;
      const sourceY = yFraction * bitmap.height - 0.5;
      const centerX = Math.round(sourceX);
      const centerY = Math.round(sourceY);
      const neighborhood = [];
      for (let y = centerY - 2; y <= centerY + 2; y += 1) {
        for (let x = centerX - 2; x <= centerX + 2; x += 1) {
          neighborhood.push({ x, y, rgb: rgbAt(x, y) });
        }
      }

      return {
        width: bitmap.width,
        height: bitmap.height,
        legacyCoordinate: { x: legacyX, y: legacyY },
        sourceCoordinate: { x: sourceX, y: sourceY },
        legacyNeighbors: neighborsAt({ x: legacyX, y: legacyY }),
        sourceNeighbors: neighborsAt({ x: sourceX, y: sourceY }),
        neighborhood
      };
    }, {
      url,
      xFraction: tile.xFraction,
      yFraction: tile.yFraction
    });

    const decodedNeighborhood = pixels.neighborhood.map(({ x, y, rgb }) => ({
      x,
      y,
      meters: decodeTerrariumRgb(...rgb)
    }));
    const neighborhoodMeters = decodedNeighborhood.map((entry) => entry.meters);
    const sourceSample = interpolateDecodedNeighbors(
      pixels.sourceNeighbors,
      pixels.sourceCoordinate
    );
    const legacySample = interpolateDecodedNeighbors(
      pixels.legacyNeighbors,
      pixels.legacyCoordinate
    );
    const reference = await authoritativeReference(control);

    results.push({
      ...control,
      tile: { z: tile.z, x: tile.x, y: tile.y, url },
      groundResolutionMeters: webMercatorGroundResolutionMeters(
        control.latitude,
        TERRAIN_ZOOM
      ),
      pixelRegistration: {
        legacyRuntime: pixels.legacyCoordinate,
        sourcePixelCenter: pixels.sourceCoordinate,
        offsetPixels: {
          x: pixels.legacyCoordinate.x - pixels.sourceCoordinate.x,
          y: pixels.legacyCoordinate.y - pixels.sourceCoordinate.y
        }
      },
      samples: {
        legacyRuntimeMeters: legacySample.meters,
        sourcePixelCenterMeters: sourceSample.meters,
        registrationDifferenceMeters:
          legacySample.meters - sourceSample.meters
      },
      rawNeighbors: sourceSample.decoded,
      neighborhoodMeters: {
        minimum: Math.min(...neighborhoodMeters),
        maximum: Math.max(...neighborhoodMeters),
        range: Math.max(...neighborhoodMeters) - Math.min(...neighborhoodMeters)
      },
      authoritativeReference: reference,
      observedDifferenceMeters: Number.isFinite(reference.elevationMeters)
        ? {
            legacyRuntime:
              legacySample.meters - reference.elevationMeters,
            sourcePixelCenter:
              sourceSample.meters - reference.elevationMeters
          }
        : null
    });
  }

  const comparable = results.filter((result) =>
    Number.isFinite(result.authoritativeReference.elevationMeters)
  );
  const sydneyComparisons = comparable.filter((result) =>
    result.id === 'sydney-urban' ||
    result.diagnosticGroup === 'sydney-grid'
  );
  const sydneyDifferences = sydneyComparisons
    .map((result) => result.observedDifferenceMeters.sourcePixelCenter)
    .sort((a, b) => a - b);
  const sydneyDifferenceMean = sydneyDifferences.reduce(
    (sum, value) => sum + value,
    0
  ) / sydneyDifferences.length;
  const sydneyDifferenceMedian = sydneyDifferences[
    Math.floor(sydneyDifferences.length / 2)
  ];
  const worstSydney = sydneyComparisons.reduce((worst, result) => {
    const absoluteDifference = Math.abs(
      result.observedDifferenceMeters.sourcePixelCenter
    );
    if (!worst || absoluteDifference > worst.absoluteDifferenceMeters) {
      return {
        id: result.id,
        latitude: result.latitude,
        longitude: result.longitude,
        terrariumMeters: result.samples.sourcePixelCenterMeters,
        referenceMeters: result.authoritativeReference.elevationMeters,
        differenceMeters: result.observedDifferenceMeters.sourcePixelCenter,
        absoluteDifferenceMeters: absoluteDifference
      };
    }
    return worst;
  }, null);
  const tileEdgeComparisons = comparable.filter((result) =>
    result.diagnosticGroup === 'baltimore-tile-edge'
  );

  console.log(JSON.stringify({
    ok: true,
    audit: 'raw-terrarium-provider',
    fetchedAt: new Date().toISOString(),
    source: TERRARIUM_SOURCE_FACTS,
    warning:
      'Provider samples are evidence only until compared with independent authoritative controls.',
    summary: {
      controlCount: results.length,
      governmentReferenceCount: comparable.length,
      sydneyGridPointCount: sydneyComparisons.length,
      sydneyDifferenceMeters: {
        minimum: sydneyDifferences[0],
        maximum: sydneyDifferences.at(-1),
        mean: sydneyDifferenceMean,
        median: sydneyDifferenceMedian,
        pointsOverFiveMeters:
          sydneyDifferences.filter((value) => Math.abs(value) > 5).length
      },
      worstSydney,
      baltimoreTileEdge: tileEdgeComparisons.length === 2
        ? {
            westTile: tileEdgeComparisons[0].tile,
            eastTile: tileEdgeComparisons[1].tile,
            longitudeSeparationDegrees:
              tileEdgeComparisons[1].longitude - tileEdgeComparisons[0].longitude,
            providerDifferenceMeters:
              tileEdgeComparisons[1].samples.sourcePixelCenterMeters -
              tileEdgeComparisons[0].samples.sourcePixelCenterMeters,
            referenceDifferenceMeters:
              tileEdgeComparisons[1].authoritativeReference.elevationMeters -
              tileEdgeComparisons[0].authoritativeReference.elevationMeters
          }
        : null
    },
    results
  }, null, 2));
} finally {
  await browser.close();
}

import { normalizeAstronomicalBodyId } from '../../astronomy/body-catalog.js?v=1';
import {
  createWorldAddress,
  worldAddressKey
} from './world-address.js?v=1';

const PLANETARY_SURFACE_SCHEMA_VERSION = 1;

const SURFACE_PUBLICATION_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  SUPERSEDED: 'superseded'
});

const SURFACE_TRUTH_CLASS = Object.freeze({
  MEASURED: 'measured',
  DERIVED: 'derived',
  MODELED: 'modeled'
});

function frozenRecord(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenRecord));
  if (!value || typeof value !== 'object') return value;
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, frozenRecord(entry)])
  ));
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function cleanId(value, label) {
  const id = String(value || '').trim().toLowerCase();
  if (!id || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
    throw new RangeError(`${label} is invalid.`);
  }
  return id;
}

function normalizeBounds(bounds = {}) {
  const normalized = {
    minX: finite(bounds.minX, 'Surface minimum X'),
    maxX: finite(bounds.maxX, 'Surface maximum X'),
    minZ: finite(bounds.minZ, 'Surface minimum Z'),
    maxZ: finite(bounds.maxZ, 'Surface maximum Z')
  };
  if (normalized.minX >= normalized.maxX || normalized.minZ >= normalized.maxZ) {
    throw new RangeError('Surface bounds must have positive width and length.');
  }
  return Object.freeze(normalized);
}

function createSurfaceRegionManifest(input = {}) {
  const bodyId = normalizeAstronomicalBodyId(input.bodyId);
  if (!bodyId) throw new RangeError(`Unknown surface body: ${input.bodyId}`);
  const regionId = cleanId(input.regionId, 'Surface region ID');
  const address = createWorldAddress({
    ...input.address,
    bodyId,
    regionId
  });
  const truthClass = String(input.truthClass || '');
  if (!Object.values(SURFACE_TRUTH_CLASS).includes(truthClass)) {
    throw new RangeError(`Unsupported surface truth class: ${truthClass}`);
  }
  const assets = (input.assets || []).map((asset) => frozenRecord({
    id: cleanId(asset.id, 'Surface asset ID'),
    role: cleanId(asset.role, 'Surface asset role'),
    url: String(asset.url || ''),
    required: asset.required !== false,
    resolutionM: Number.isFinite(Number(asset.resolutionM)) ? Number(asset.resolutionM) : null,
    sourceProduct: String(asset.sourceProduct || '')
  }));
  if (assets.length === 0 || assets.some((asset) => !asset.url || !asset.sourceProduct)) {
    throw new TypeError('Surface regions require identified source assets and source products.');
  }
  const assetIds = new Set(assets.map((asset) => asset.id));
  if (assetIds.size !== assets.length) throw new RangeError('Surface asset IDs must be unique.');

  return frozenRecord({
    type: 'PlanetarySurfaceRegionManifest',
    schemaVersion: PLANETARY_SURFACE_SCHEMA_VERSION,
    regionId,
    bodyId,
    address,
    addressKey: worldAddressKey(address),
    displayName: String(input.displayName || regionId),
    truthClass,
    coordinateSystem: String(input.coordinateSystem || ''),
    verticalDatum: String(input.verticalDatum || ''),
    metersPerUnit: Math.max(0.000001, finite(input.metersPerUnit ?? 1, 'Surface meters per unit')),
    localBounds: normalizeBounds(input.localBounds),
    renderPlacement: {
      x: finite(input.renderPlacement?.x ?? 0, 'Surface placement X'),
      y: finite(input.renderPlacement?.y ?? 0, 'Surface placement Y'),
      z: finite(input.renderPlacement?.z ?? 0, 'Surface placement Z')
    },
    source: {
      title: String(input.source?.title || ''),
      url: String(input.source?.url || ''),
      provider: String(input.source?.provider || ''),
      attribution: String(input.source?.attribution || ''),
      rights: String(input.source?.rights || ''),
      processing: String(input.source?.processing || '')
    },
    assets,
    rollbackId: String(input.rollbackId || `${regionId}-v1`)
  });
}

const APOLLO11_SURFACE_REGION = createSurfaceRegionManifest({
  regionId: 'apollo-11-tranquility-base',
  bodyId: 'moon',
  displayName: 'Apollo 11 — Tranquility Base',
  truthClass: SURFACE_TRUTH_CLASS.DERIVED,
  address: {
    latitudeDeg: 0.67416,
    longitudeDegPositiveEast: 23.47314,
    heightM: -1927.61,
    scopeType: 'world',
    scopeId: 'public'
  },
  coordinateSystem: 'IAU Moon planetocentric latitude / positive-east longitude',
  verticalDatum: 'LROC NAC DTM elevation, LOLA controlled',
  metersPerUnit: 1,
  localBounds: {
    minX: -2110.1280938447745,
    maxX: 2110.1280938447745,
    minZ: -13976.999980219282,
    maxZ: 13976.999980219282
  },
  renderPlacement: {
    x: -746.8990434836144,
    y: -100,
    z: -3575.209985663413
  },
  source: {
    title: 'LROC NAC Apollo 11 Landing Site DTM and orthophoto',
    url: 'https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_APOLLO11',
    provider: 'Lunar Reconnaissance Orbiter Camera / Arizona State University',
    attribution: 'NASA/GSFC/Arizona State University',
    rights: 'Source-product terms and attribution retained with the bundled derivatives.',
    processing: '2 m/post source DTM and orthophoto resized to 8 m/post browser assets.'
  },
  assets: [
    {
      id: 'apollo11-lroc-dtm-8m',
      role: 'height',
      url: '/app/assets/textures/moon/apollo11_lroc_dtm_8m.png',
      resolutionM: 8,
      sourceProduct: 'NAC_DTM_APOLLO11'
    },
    {
      id: 'apollo11-lroc-ortho-8m',
      role: 'albedo',
      url: '/app/assets/textures/moon/apollo11_lroc_ortho_8m.jpg',
      resolutionM: 8,
      sourceProduct: 'NAC_DTM_APOLLO11_M150368601_2M'
    }
  ],
  rollbackId: 'apollo-11-lroc-runtime-v1'
});

const OLYMPUS_MONS_SURFACE_REGION = createSurfaceRegionManifest({
  regionId: 'mars-olympus-mons',
  bodyId: 'mars',
  displayName: 'Olympus Mons',
  truthClass: SURFACE_TRUTH_CLASS.DERIVED,
  address: {
    latitudeDeg: 18.65,
    longitudeDegPositiveEast: 226.2,
    heightM: 0,
    scopeType: 'world',
    scopeId: 'public'
  },
  coordinateSystem: 'Mars planetocentric latitude / positive-east longitude',
  verticalDatum: 'MOLA regional elevation browse product; gameplay relief calibration declared separately',
  metersPerUnit: 1,
  localBounds: { minX: -12000, maxX: 12000, minZ: -12000, maxZ: 12000 },
  renderPlacement: { x: 0, y: -80, z: 0 },
  source: {
    title: 'Olympus Mons regional MOLA elevation and Viking color context',
    url: 'https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m',
    provider: 'USGS Astrogeology / NASA',
    attribution: 'USGS Astrogeology; NASA Mars Global Surveyor MOLA and Viking',
    rights: 'USGS source products are public domain; attribution and derivative processing are retained.',
    processing: 'Local browser crops with measured elevation normalized to a declared traversable display scale.'
  },
  assets: [
    {
      id: 'mars-mola-olympus-dem-512',
      role: 'height',
      url: '/app/assets/textures/mars_mola_olympus_dem_512.jpg',
      sourceProduct: 'Mars MGS MOLA DEM 463m browse raster'
    },
    {
      id: 'mars-viking-olympus-900',
      role: 'albedo',
      url: '/app/assets/textures/mars_olympus_viking_900.jpg',
      sourceProduct: 'Mars Viking MDIM 2.1 colorized global mosaic'
    }
  ],
  rollbackId: 'mars-olympus-runtime-v1'
});

const CALORIS_PLANITIA_SURFACE_REGION = createSurfaceRegionManifest({
  regionId: 'mercury-caloris-planitia',
  bodyId: 'mercury',
  displayName: 'Caloris Planitia',
  truthClass: SURFACE_TRUTH_CLASS.MODELED,
  address: {
    latitudeDeg: 30.5,
    longitudeDegPositiveEast: 162.2,
    heightM: 0,
    scopeType: 'world',
    scopeId: 'public'
  },
  coordinateSystem: 'IAU Mercury planetocentric latitude / positive-east longitude',
  verticalDatum: 'Modeled regional relief informed by MESSENGER global morphology; not local elevation data',
  metersPerUnit: 1,
  localBounds: { minX: -8000, maxX: 8000, minZ: -8000, maxZ: 8000 },
  renderPlacement: { x: 0, y: -80, z: 0 },
  source: {
    title: 'MESSENGER enhanced-color Mercury map',
    url: 'https://science.nasa.gov/resource/enhanced-color-mercury-map/',
    provider: 'NASA MESSENGER',
    attribution: 'NASA/Johns Hopkins University Applied Physics Laboratory/Carnegie Institution of Washington; USGS',
    rights: 'NASA source imagery used with mission credit retained under NASA media usage guidance.',
    processing: 'Enhanced colors represent compositional variation rather than human-eye color; local relief is labeled modeled game terrain.'
  },
  assets: [{
    id: 'mercury-messenger-global',
    role: 'albedo',
    url: '/app/assets/textures/mercury_messenger.jpg',
    sourceProduct: 'MESSENGER Mercury global mosaic'
  }],
  rollbackId: 'mercury-caloris-modeled-runtime-v1'
});

const MAXWELL_MONTES_SURFACE_REGION = createSurfaceRegionManifest({
  regionId: 'venus-maxwell-montes',
  bodyId: 'venus',
  displayName: 'Maxwell Montes',
  truthClass: SURFACE_TRUTH_CLASS.MODELED,
  address: {
    latitudeDeg: 65.2,
    longitudeDegPositiveEast: 3.0,
    heightM: 0,
    scopeType: 'world',
    scopeId: 'public'
  },
  coordinateSystem: 'IAU Venus planetocentric latitude / positive-east longitude',
  verticalDatum: 'Modeled regional relief informed by Magellan radar morphology; not a visible-light terrain photograph',
  metersPerUnit: 1,
  localBounds: { minX: -8000, maxX: 8000, minZ: -8000, maxZ: 8000 },
  renderPlacement: { x: 0, y: -80, z: 0 },
  source: {
    title: 'Magellan-derived Venus texture for 3D models',
    url: 'https://science.nasa.gov/3d-resources/venus/',
    provider: 'NASA/JPL-Caltech',
    attribution: 'NASA/JPL-Caltech',
    rights: 'NASA source imagery used with source credit retained under NASA media usage guidance.',
    processing: 'Texture is stitched from Magellan radar imagery with gaps filled by a global texture; local relief and color are labeled modeled game presentation.'
  },
  assets: [{
    id: 'venus-magellan-global-radar',
    role: 'radar-albedo',
    url: '/app/assets/textures/venus_magellan.jpg',
    sourceProduct: 'Magellan global radar mosaic'
  }],
  rollbackId: 'venus-maxwell-modeled-runtime-v1'
});

const SURFACE_REGIONS = Object.freeze({
  [APOLLO11_SURFACE_REGION.regionId]: APOLLO11_SURFACE_REGION,
  [OLYMPUS_MONS_SURFACE_REGION.regionId]: OLYMPUS_MONS_SURFACE_REGION,
  [CALORIS_PLANITIA_SURFACE_REGION.regionId]: CALORIS_PLANITIA_SURFACE_REGION,
  [MAXWELL_MONTES_SURFACE_REGION.regionId]: MAXWELL_MONTES_SURFACE_REGION
});

function getPlanetarySurfaceRegion(regionId) {
  return SURFACE_REGIONS[String(regionId || '').trim().toLowerCase()] || null;
}

function listPlanetarySurfaceRegions() {
  return Object.freeze(Object.values(SURFACE_REGIONS));
}

function publicationSummary(publication) {
  if (!publication) return null;
  return frozenRecord({
    regionId: publication.manifest.regionId,
    bodyId: publication.manifest.bodyId,
    addressKey: publication.manifest.addressKey,
    rollbackId: publication.manifest.rollbackId,
    acceptedAtMs: publication.acceptedAtMs,
    readyAssetIds: publication.readyAssetIds
  });
}

function createPlanetarySurfaceAuthority(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  let generation = 0;
  let active = null;
  let rollback = null;
  const acceptedPublications = new Map();
  let state = frozenRecord({
    generation,
    status: SURFACE_PUBLICATION_STATUS.IDLE,
    reason: null,
    candidate: null,
    active: null,
    rollbackAvailable: false
  });

  const publishState = (next) => {
    state = frozenRecord({
      generation,
      status: next.status,
      reason: next.reason || null,
      candidate: next.candidate || null,
      active: publicationSummary(active),
      rollbackAvailable: !!rollback
    });
    return state;
  };

  const prepare = async (regionId, loadCandidate) => {
    const manifest = getPlanetarySurfaceRegion(regionId);
    if (!manifest) throw new RangeError(`Unknown planetary surface region: ${regionId}`);
    if (typeof loadCandidate !== 'function') throw new TypeError('Surface candidate loader is required.');
    const requestGeneration = ++generation;
    publishState({
      status: SURFACE_PUBLICATION_STATUS.LOADING,
      candidate: { regionId: manifest.regionId, bodyId: manifest.bodyId }
    });

    let payload;
    try {
      payload = await loadCandidate(manifest);
    } catch (error) {
      if (requestGeneration !== generation) {
        return frozenRecord({
          generation: requestGeneration,
          status: SURFACE_PUBLICATION_STATUS.SUPERSEDED,
          reason: 'newer-surface-request-active',
          candidate: { regionId: manifest.regionId, bodyId: manifest.bodyId },
          active: publicationSummary(active),
          rollbackAvailable: !!rollback
        });
      }
      return publishState({
        status: SURFACE_PUBLICATION_STATUS.REJECTED,
        reason: error?.message || 'surface-loader-threw',
        candidate: { regionId: manifest.regionId, bodyId: manifest.bodyId }
      });
    }
    if (requestGeneration !== generation) {
      return frozenRecord({
        generation: requestGeneration,
        status: SURFACE_PUBLICATION_STATUS.SUPERSEDED,
        reason: 'newer-surface-request-active',
        candidate: { regionId: manifest.regionId, bodyId: manifest.bodyId },
        active: publicationSummary(active),
        rollbackAvailable: !!rollback
      });
    }
    if (typeof payload?.sampleHeight !== 'function') {
      return publishState({
        status: SURFACE_PUBLICATION_STATUS.REJECTED,
        reason: 'surface-height-sampler-required',
        candidate: { regionId: manifest.regionId, bodyId: manifest.bodyId }
      });
    }
    const readyAssetIds = Object.freeze([...(payload.readyAssetIds || [])].map(String));
    const requiredAssetIds = manifest.assets.filter((asset) => asset.required).map((asset) => asset.id);
    if (requiredAssetIds.some((id) => !readyAssetIds.includes(id))) {
      return publishState({
        status: SURFACE_PUBLICATION_STATUS.REJECTED,
        reason: 'required-surface-assets-not-ready',
        candidate: { regionId: manifest.regionId, bodyId: manifest.bodyId }
      });
    }

    rollback = active;
    active = {
      manifest,
      sampleHeight: payload.sampleHeight,
      renderArtifact: payload.renderArtifact || null,
      readyAssetIds,
      acceptedAtMs: finite(now(), 'Surface acceptance time')
    };
    acceptedPublications.set(manifest.regionId, active);
    return publishState({
      status: SURFACE_PUBLICATION_STATUS.ACCEPTED,
      candidate: null
    });
  };

  const sampleAtLocalXZ = (x, z, expected = {}) => {
    const localX = finite(x, 'Surface sample X');
    const localZ = finite(z, 'Surface sample Z');
    if (!active) return frozenRecord({ status: 'unavailable', reason: 'no-accepted-surface' });
    const expectedBody = expected.bodyId ? normalizeAstronomicalBodyId(expected.bodyId) : null;
    if (expectedBody && expectedBody !== active.manifest.bodyId) {
      return frozenRecord({ status: 'unavailable', reason: 'surface-body-mismatch' });
    }
    if (expected.regionId && String(expected.regionId) !== active.manifest.regionId) {
      return frozenRecord({ status: 'unavailable', reason: 'surface-region-mismatch' });
    }
    const bounds = active.manifest.localBounds;
    if (localX < bounds.minX || localX > bounds.maxX || localZ < bounds.minZ || localZ > bounds.maxZ) {
      return frozenRecord({ status: 'unavailable', reason: 'outside-accepted-surface' });
    }
    const localY = finite(active.sampleHeight(localX, localZ), 'Surface sample height');
    return frozenRecord({
      status: 'available',
      bodyId: active.manifest.bodyId,
      regionId: active.manifest.regionId,
      addressKey: active.manifest.addressKey,
      truthClass: active.manifest.truthClass,
      local: { x: localX, y: localY, z: localZ },
      render: {
        x: localX + active.manifest.renderPlacement.x,
        y: localY + active.manifest.renderPlacement.y,
        z: localZ + active.manifest.renderPlacement.z
      },
      source: active.manifest.source
    });
  };

  const rollbackPublication = () => {
    generation += 1;
    if (!rollback) {
      return publishState({ status: active ? SURFACE_PUBLICATION_STATUS.ACCEPTED : SURFACE_PUBLICATION_STATUS.IDLE });
    }
    const current = active;
    active = rollback;
    rollback = current;
    return publishState({ status: SURFACE_PUBLICATION_STATUS.ACCEPTED });
  };

  const activate = (regionId) => {
    const manifest = getPlanetarySurfaceRegion(regionId);
    if (!manifest) throw new RangeError(`Unknown planetary surface region: ${regionId}`);
    generation += 1;
    if (active?.manifest.regionId === manifest.regionId) {
      return publishState({ status: SURFACE_PUBLICATION_STATUS.ACCEPTED });
    }
    const publication = acceptedPublications.get(manifest.regionId);
    if (!publication) {
      return publishState({
        status: SURFACE_PUBLICATION_STATUS.REJECTED,
        reason: 'surface-region-not-loaded',
        candidate: { regionId: manifest.regionId, bodyId: manifest.bodyId }
      });
    }
    rollback = active;
    active = publication;
    return publishState({ status: SURFACE_PUBLICATION_STATUS.ACCEPTED });
  };

  const clear = (reason = 'surface-cleared') => {
    generation += 1;
    active = null;
    rollback = null;
    acceptedPublications.clear();
    return publishState({ status: SURFACE_PUBLICATION_STATUS.IDLE, reason });
  };

  return Object.freeze({
    activate,
    clear,
    prepare,
    rollback: rollbackPublication,
    sampleAtLocalXZ,
    snapshot: () => state
  });
}

function ensurePlanetarySurfaceAuthority(appContext, options = {}) {
  if (!appContext || typeof appContext !== 'object') {
    throw new TypeError('Application context is required for planetary surface authority.');
  }
  if (!appContext.planetarySurfaceAuthority) {
    appContext.planetarySurfaceAuthority = createPlanetarySurfaceAuthority(options);
  }
  return appContext.planetarySurfaceAuthority;
}

export {
  APOLLO11_SURFACE_REGION,
  CALORIS_PLANITIA_SURFACE_REGION,
  createPlanetarySurfaceAuthority,
  createSurfaceRegionManifest,
  ensurePlanetarySurfaceAuthority,
  getPlanetarySurfaceRegion,
  listPlanetarySurfaceRegions,
  MAXWELL_MONTES_SURFACE_REGION,
  OLYMPUS_MONS_SURFACE_REGION,
  PLANETARY_SURFACE_SCHEMA_VERSION,
  SURFACE_PUBLICATION_STATUS,
  SURFACE_TRUTH_CLASS
};

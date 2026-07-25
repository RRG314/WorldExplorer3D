import { getVectorTileLib } from './shortbread-source.js?v=13';

const OVERTURE_RELEASE = '2026-06-17.0';
const OVERTURE_THEME_ZOOM = Object.freeze({
  base: 13,
  buildings: 14,
  transportation: 14
});
const SUPPORTED_THEMES = new Set(Object.keys(OVERTURE_THEME_ZOOM));
const DEFAULT_TIMEOUT_MS = 20000;

let pmtilesLibPromise = null;
const archives = new Map();

function assertTheme(theme) {
  const normalized = String(theme || '').trim().toLowerCase();
  if (!SUPPORTED_THEMES.has(normalized)) throw new TypeError(`Unsupported Overture theme: ${theme}`);
  return normalized;
}

function overtureThemeArchiveUrl(theme) {
  const normalized = assertTheme(theme);
  const config = globalThis.WORLD_EXPLORER_CONFIG || {};
  const configured = config.overtureThemePmtilesUrls?.[normalized] ||
    (normalized === 'buildings' ? config.overtureBuildingsPmtilesUrl : '') ||
    globalThis.document?.querySelector?.(`meta[name="worldexplorer-overture-${normalized}"]`)?.content;
  return String(configured ||
    `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${OVERTURE_RELEASE}/${normalized}.pmtiles`
  ).trim();
}

async function getPmtilesLibrary() {
  if (!pmtilesLibPromise) {
    const moduleUrl = new URL(
      '../../vendor/pmtiles-4.4.1/index.js',
      import.meta.url
    ).toString();
    pmtilesLibPromise = import(moduleUrl)
      .catch((error) => {
        pmtilesLibPromise = null;
        throw error;
      });
  }
  return pmtilesLibPromise;
}

async function getThemeArchive(theme) {
  const normalized = assertTheme(theme);
  const url = overtureThemeArchiveUrl(normalized);
  const cached = archives.get(normalized);
  if (cached?.url === url) return cached.archive;
  const { PMTiles } = await getPmtilesLibrary();
  const archive = new PMTiles(url);
  archives.set(normalized, { archive, url });
  return archive;
}

function abortError(message) {
  return new DOMException(message, 'AbortError');
}

function overtureThemeTileCoordinates(theme, z, x, y) {
  const normalized = assertTheme(theme);
  const requestedZoom = Math.max(0, Math.round(Number(z) || 0));
  const zoom = Math.min(OVERTURE_THEME_ZOOM[normalized], requestedZoom);
  const parentScale = 2 ** Math.max(0, requestedZoom - zoom);
  const maxIndex = 2 ** zoom - 1;
  return {
    z: zoom,
    x: Math.max(0, Math.min(maxIndex, Math.floor((Number(x) || 0) / parentScale))),
    y: Math.max(0, Math.min(maxIndex, Math.floor((Number(y) || 0) / parentScale)))
  };
}

async function fetchOvertureThemeTile(theme, z, x, y, options = {}) {
  const normalized = assertTheme(theme);
  const coordinates = overtureThemeTileCoordinates(normalized, z, x, y);
  const { z: zoom, x: tileX, y: tileY } = coordinates;
  const controller = new AbortController();
  const externalSignal = options.signal || null;
  const abortFromExternal = () => controller.abort(externalSignal?.reason || abortError('Overture tile request aborted'));
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener?.('abort', abortFromExternal, { once: true });
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const timeoutId = globalThis.setTimeout(() => controller.abort(abortError('Overture tile request timed out')), timeoutMs);

  try {
    const archive = await getThemeArchive(normalized);
    if (controller.signal.aborted) throw controller.signal.reason || abortError('Overture tile request aborted');
    const result = await archive.getZxy(zoom, tileX, tileY, controller.signal);
    if (controller.signal.aborted) throw controller.signal.reason || abortError('Overture tile request aborted');
    if (!result?.data) return null;
    const { Pbf, VectorTile } = await getVectorTileLib();
    return {
      tile: new VectorTile(new Pbf(result.data)),
      theme: normalized,
      release: OVERTURE_RELEASE,
      source: 'overture-pmtiles',
      archiveUrl: overtureThemeArchiveUrl(normalized),
      z: zoom,
      x: tileX,
      y: tileY
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
    externalSignal?.removeEventListener?.('abort', abortFromExternal);
  }
}

export {
  OVERTURE_RELEASE,
  OVERTURE_THEME_ZOOM,
  fetchOvertureThemeTile,
  overtureThemeArchiveUrl,
  overtureThemeTileCoordinates
};

const RENDER_PROVENANCE_VERSION = 1;

function cleanList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function createRenderProvenance(options = {}) {
  const surfaceTile = options.surfaceTile || null;
  const tileRecord = options.tileRecord || null;
  const z = Number.isFinite(Number(surfaceTile?.z)) ? Number(surfaceTile.z) : Number(tileRecord?.z);
  const x = Number.isFinite(Number(surfaceTile?.x)) ? Number(surfaceTile.x) : Number(tileRecord?.x);
  const y = Number.isFinite(Number(surfaceTile?.y)) ? Number(surfaceTile.y) : Number(tileRecord?.y);
  const tileKey = [z, x, y].every(Number.isFinite) ? `${z}/${x}/${y}` : '';
  return Object.freeze({
    version: RENDER_PROVENANCE_VERSION,
    profile: String(surfaceTile?.profile || options.profile || ''),
    provider: String(options.provider || ''),
    dataset: String(options.dataset || tileRecord?.source || ''),
    release: String(options.release || tileRecord?.release || ''),
    tileKey,
    layer: String(options.layer || ''),
    role: String(options.role || ''),
    sources: cleanList(options.sources || surfaceTile?.sources),
    fallback: options.fallback === true
  });
}

function attachRenderProvenance(target, provenance) {
  if (!target || !provenance) return target;
  if (target.userData && typeof target.userData === 'object') {
    target.userData.renderProvenance = provenance;
  } else {
    target.renderProvenance = provenance;
  }
  return target;
}

function attachStreamProvenance(target, chunk, tileRecord, options = {}) {
  const provider = options.provider || (
    tileRecord?.source === 'overture-pmtiles'
      ? 'Overture Maps Foundation'
      : 'OpenStreetMap Foundation'
  );
  return attachRenderProvenance(target, createRenderProvenance({
    surfaceTile: chunk?.surfaceTile,
    tileRecord,
    provider,
    dataset: tileRecord?.source,
    layer: options.layer,
    role: options.role
  }));
}

export {
  RENDER_PROVENANCE_VERSION,
  attachRenderProvenance,
  attachStreamProvenance,
  createRenderProvenance
};

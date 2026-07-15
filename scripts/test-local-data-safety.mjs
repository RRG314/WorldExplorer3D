import path from 'node:path';
import { pathToFileURL } from 'node:url';

class StorageMock {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(String(key), String(value));
  }
  removeItem(key) {
    this.map.delete(String(key));
  }
  clear() {
    this.map.clear();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function moduleUrl(relativePath) {
  return `${pathToFileURL(path.join(process.cwd(), relativePath)).href}?t=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

globalThis.localStorage = new StorageMock();
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  getElementById() { return null; }
};
globalThis.THREE = {
  Vector2: class Vector2 {},
  Vector3: class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  },
  Plane: class Plane {
    constructor(normal, constant) {
      this.normal = normal;
      this.constant = constant;
    }
  },
  Matrix3: class Matrix3 {},
  Raycaster: class Raycaster {
    constructor() {
      this.far = 0;
    }
  }
};

const activityLib = await import(moduleUrl('app/js/activity-discovery/library.js'));
const localDrafts = await import(moduleUrl('app/js/editor/local-drafts.js'));

const ACTIVITY_KEY = 'worldExplorer3D.activityLibrary.v1';
const ACTIVITY_BACKUP_KEY = 'worldExplorer3D.activityLibrary.backup.v1';
const DRAFT_KEY = 'world_explorer_overlay_local_drafts_v1';
const DRAFT_BACKUP_KEY = 'world_explorer_overlay_local_drafts_backup_v1';
const BUILD_KEY = 'worldExplorer3D.buildBlocks.v1';
const BUILD_BACKUP_KEY = 'worldExplorer3D.buildBlocks.backup.v1';
const BUILD_MIGRATION_KEY = 'worldExplorer3D.buildBlocks.migrated.v2';

function runActivityLibraryChecks() {
  localStorage.clear();

  const backupRows = [{
    id: 'creator_existing',
    templateId: 'walking_route',
    title: 'Existing Creator Draft',
    anchors: [
      { id: 'start_existing', typeId: 'start', label: 'Start', x: 0, y: 0, z: 0 },
      { id: 'finish_existing', typeId: 'finish', label: 'Finish', x: 20, y: 0, z: 0 }
    ],
    createdAt: 1,
    updatedAt: 2
  }];

  localStorage.setItem(ACTIVITY_KEY, '{bad json');
  localStorage.setItem(ACTIVITY_BACKUP_KEY, JSON.stringify(backupRows));

  const recovered = activityLib.listStoredActivities();
  assert(recovered.length === 1, 'Activity library should recover from backup when primary is corrupted.');
  assert(localStorage.getItem(ACTIVITY_KEY)?.includes('creator_existing'), 'Activity library should restore the primary key from backup.');

  const saved = activityLib.saveCreatorActivityDraft({
    templateId: 'walking_route',
    anchors: [
      { id: 'start_new', typeId: 'start', label: 'Start', x: 0, y: 0, z: 0 },
      { id: 'finish_new', typeId: 'finish', label: 'Finish', x: 8, y: 0, z: 8 }
    ],
    name: 'New Draft'
  }, {
    title: 'New Draft'
  });

  assert(!!saved?.id, 'Activity library save should produce an id.');
  assert(localStorage.getItem(ACTIVITY_KEY) === localStorage.getItem(ACTIVITY_BACKUP_KEY), 'Activity library should mirror writes to backup storage.');
}

function runOverlayDraftChecks() {
  localStorage.clear();

  const backupRows = [{
    featureId: 'feature_existing',
    featureClass: 'road',
    geometryType: 'LineString',
    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    tags: { name: 'Existing Draft' },
    reviewState: 'draft',
    publicationState: 'unpublished',
    createdAtMs: 1,
    updatedAtMs: 2
  }];

  localStorage.setItem(DRAFT_KEY, '{bad json');
  localStorage.setItem(DRAFT_BACKUP_KEY, JSON.stringify(backupRows));

  const recovered = localDrafts.listLocalOverlayDrafts();
  assert(recovered.length === 1, 'Overlay drafts should recover from backup when primary is corrupted.');
  assert(localStorage.getItem(DRAFT_KEY)?.includes('feature_existing'), 'Overlay drafts should restore the primary key from backup.');

  const saved = localDrafts.upsertLocalOverlayDraft({
    featureId: 'feature_new',
    featureClass: 'poi',
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [0, 0] },
    tags: { name: 'New Draft' }
  });

  assert(saved?.featureId === 'feature_new', 'Overlay draft save should preserve the new feature id.');
  assert(localStorage.getItem(DRAFT_KEY) === localStorage.getItem(DRAFT_BACKUP_KEY), 'Overlay draft writes should mirror to backup storage.');
}

async function runBuildBlockChecks() {
  localStorage.clear();

  const ctxModule = await import(moduleUrl('app/js/shared-context.js'));
  Object.assign(ctxModule.ctx, {
    LOC: { lat: 39.2904, lon: -76.6122 },
    SCALE: 1000,
    onMoon: false
  });

  const backupRows = [{
    id: 'blk_existing',
    locationKey: '39.29040,-76.61220',
    lat: 39.2904,
    lon: -76.6122,
    gx: 0,
    gy: 1,
    gz: 0,
    materialIndex: 0,
    createdAt: '2026-01-01T00:00:00.000Z'
  }];

  localStorage.setItem(BUILD_KEY, '{bad json');
  localStorage.setItem(BUILD_BACKUP_KEY, JSON.stringify(backupRows));

  const blocks = await import(moduleUrl('app/js/blocks.js'));
  const limits = blocks.getBuildLimits();
  assert(limits.totalCount === 1, 'Build blocks should recover existing entries from backup storage.');
  assert(localStorage.getItem(BUILD_KEY)?.includes('blk_existing'), 'Build blocks should restore the primary key from backup.');
  assert(localStorage.getItem(BUILD_MIGRATION_KEY) === 'done', 'Build block migration marker should still be written.');
}

runActivityLibraryChecks();
runOverlayDraftChecks();
await runBuildBlockChecks();

console.log(JSON.stringify({ ok: true }, null, 2));

import { ctx as appCtx } from '../shared-context.js?v=55';
import { listStoredActivities } from '../activity-discovery/library.js?v=2';
import {
  defaultSystemCreatorProfile,
  getCreatorProfile,
  listCreatorPublishedContributions,
  normalizeCreatorProfile
} from '../../../js/creator-profile-api.js?v=1';

function sanitizeText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function currentAuthUid() {
  return sanitizeText(appCtx.authUser?.uid || globalThis.__WE3D_AUTH_UID__ || '', 160);
}

function activitySortValue(activity = {}) {
  return finiteNumber(activity.updatedAt, finiteNumber(activity.updatedAtMs, finiteNumber(activity.createdAt, 0)));
}

function summarizeActivity(entry = {}) {
  return {
    id: sanitizeText(entry.id || '', 120).toLowerCase(),
    title: sanitizeText(entry.title || entry.name || 'Creator Activity', 120),
    description: sanitizeText(entry.description || '', 220),
    locationLabel: sanitizeText(entry.locationLabel || '', 120),
    visibility: sanitizeText(entry.visibility || 'private', 24).toLowerCase(),
    status: sanitizeText(entry.status || (sanitizeText(entry.visibility || '', 24).toLowerCase() === 'public' ? 'published' : 'draft'), 24).toLowerCase(),
    templateId: sanitizeText(entry.templateId || '', 80).toLowerCase(),
    updatedAtMs: activitySortValue(entry),
    sourceType: sanitizeText(entry.sourceType || 'creator', 24).toLowerCase(),
    creatorId: sanitizeText(entry.creatorId || '', 160),
    creatorName: sanitizeText(entry.creatorName || 'Explorer', 80)
  };
}

function uniqueActivities(items = []) {
  const out = [];
  const seen = new Set();
  items.forEach((entry) => {
    const item = summarizeActivity(entry);
    if (!item.id || seen.has(item.id)) return;
    seen.add(item.id);
    out.push(item);
  });
  return out.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

function visibleCatalogActivities(creatorId = '', creatorName = '') {
  const cleanCreatorId = sanitizeText(creatorId || '', 160);
  const cleanCreatorName = sanitizeText(creatorName || '', 80);
  const catalog = Array.isArray(appCtx.activityDiscoveryCatalog) ? appCtx.activityDiscoveryCatalog : [];
  return catalog.filter((entry) => {
    const entryCreatorId = sanitizeText(entry?.creatorId || '', 160);
    const entryCreatorName = sanitizeText(entry?.creatorName || '', 80);
    if (cleanCreatorId && entryCreatorId) return entryCreatorId === cleanCreatorId;
    return cleanCreatorName && entryCreatorName === cleanCreatorName;
  });
}

function savedActivitiesForCreator(creatorId = '', includeUnattributedSelf = false) {
  const cleanCreatorId = sanitizeText(creatorId || '', 160);
  return listStoredActivities().filter((entry) => {
    const entryCreatorId = sanitizeText(entry?.creatorId || '', 160);
    if (entryCreatorId) return entryCreatorId === cleanCreatorId;
    return includeUnattributedSelf;
  });
}

function combineStats(profile = {}, activities = [], contributions = []) {
  const base = profile?.stats && typeof profile.stats === 'object' ? profile.stats : {};
  const publishedActivities = activities.filter((entry) => entry.visibility === 'public' || entry.status === 'published').length;
  return {
    activitiesCreated: Math.max(finiteNumber(base.activitiesCreated, 0), activities.length),
    activitiesPublished: Math.max(finiteNumber(base.activitiesPublished, 0), publishedActivities),
    totalPlays: finiteNumber(base.totalPlays, 0),
    contributionsCount: Math.max(finiteNumber(base.contributionsCount, 0), contributions.length),
    publishedContributions: Math.max(finiteNumber(base.publishedContributions, 0), contributions.length)
  };
}

async function loadCreatorProfileView(options = {}) {
  const creatorId = sanitizeText(options.creatorId || '', 160);
  const creatorName = sanitizeText(options.creatorName || '', 80);
  const authUid = currentAuthUid();
  const isSelf = !!creatorId && creatorId === authUid;
  let profile = null;

  if (creatorId === 'system_worldexplorer') {
    profile = defaultSystemCreatorProfile();
  } else if (creatorId) {
    profile = await getCreatorProfile(creatorId);
  }

  if (!profile) {
    profile = normalizeCreatorProfile({
      userId: creatorId,
      username: creatorName || 'Explorer',
      avatar: sanitizeText(options.creatorAvatar || '🌍', 12) || '🌍',
      bio: '',
      stats: {},
      spaces: {}
    });
  }

  const visibleActivities = visibleCatalogActivities(profile.userId, profile.username);
  const savedActivities = savedActivitiesForCreator(profile.userId, isSelf);
  const activities = uniqueActivities([...savedActivities, ...visibleActivities]);
  const contributions = profile.userId
    ? await listCreatorPublishedContributions(profile.userId, { limit: 8 }).catch(() => [])
    : [];

  return {
    profile,
    creatorId: profile.userId,
    isSelf,
    activities,
    contributions,
    stats: combineStats(profile, activities, contributions),
    sourceActivityId: sanitizeText(options.sourceActivityId || '', 120).toLowerCase()
  };
}

export {
  loadCreatorProfileView
};

// One wire model for the Journal-owned local projection and protected service.
// Widget actions record interest/learning only; they cannot award game receipts.
export const PORTAL_TRAIL_VERSION = 1;
const id = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(value);
const time = value => Number.isSafeInteger(value) && value > 0;
const copy = value => JSON.parse(JSON.stringify(value));
const actionSlots = Object.freeze({save:'saved',unsave:'saved',investigate:'investigated',offered:'offered'});
const uidValid = value => typeof value === 'string' && /^[^\u0000-\u001f\u007f]{1,128}$/u.test(value);

export function portalOwnerScope(uid = null) {
  if (uid == null || uid === '') return 'device-guest';
  if (!uidValid(uid)) throw new TypeError('Invalid Explorer identity.');
  return `account:${uid}`;
}

export function portalTrailPrefix(ownerScope) {
  if (!(ownerScope === 'device-guest' || (typeof ownerScope === 'string' && ownerScope.startsWith('account:') && uidValid(ownerScope.slice(8))))) {
    throw new TypeError('Trail records require an owner and destination.');
  }
  return `portal-trail:${encodeURIComponent(ownerScope)}|`;
}

export function portalTrailKey(ownerScope, destinationId) {
  if(!id(destinationId))throw new TypeError('Trail records require an owner and destination.');
  return `${portalTrailPrefix(ownerScope)}${destinationId}`;
}

export function emptyPortalTrailState(destinationId) {
  if (!id(destinationId)) throw new TypeError('Invalid Portal destination.');
  return {destinationId,revision:0,firstOfferedAt:0,lastOfferedAt:0,saved:false,savedAt:0,
    investigatedAt:0,investigationVersion:null,visitedAt:0,expeditionIds:[]};
}

export function validatePortalTrailState(input, destinationId = input?.destinationId) {
  if (!input || input.destinationId !== destinationId || !id(destinationId) ||
      !Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.saved !== 'boolean' ||
      !['firstOfferedAt','lastOfferedAt','savedAt','investigatedAt','visitedAt'].every(key => input[key] === 0 || time(input[key])) ||
      !(input.investigationVersion === null || id(input.investigationVersion)) ||
      !Array.isArray(input.expeditionIds) || input.expeditionIds.length > 128 ||
      !input.expeditionIds.every(id) || new Set(input.expeditionIds).size !== input.expeditionIds.length ||
      (input.investigatedAt > 0 && !input.investigationVersion) || (input.saved && !input.savedAt) ||
      (input.firstOfferedAt > input.lastOfferedAt)) throw new TypeError('Invalid Exploration Trail state.');
  return Object.fromEntries(Object.keys(emptyPortalTrailState(destinationId)).map(key=>[key,copy(input[key])]));
}

export function normalizePortalAction(input) {
  if (!input || !id(input.operationId) || !id(input.destinationId) || !Object.hasOwn(actionSlots,input.kind) ||
      !time(input.createdAt) || (input.kind === 'investigate' && !id(input.contentVersion))) {
    throw new TypeError('Invalid Portal action.');
  }
  // Explicit fields only: a widget cannot smuggle rewards, an owner, a visit or
  // activity completion into the saved record through arbitrary JSON fields.
  return {operationId:input.operationId,destinationId:input.destinationId,kind:input.kind,
    createdAt:input.createdAt,...(input.kind === 'investigate' ? {contentVersion:input.contentVersion} : {})};
}

export function applyPortalAction(state, input, now = input?.createdAt) {
  const action = normalizePortalAction(input);
  const next = validatePortalTrailState(state,action.destinationId);
  if (!time(now)) throw new TypeError('Portal actions require a valid timestamp.');
  next.firstOfferedAt = next.firstOfferedAt ? Math.min(next.firstOfferedAt,now) : now;
  next.lastOfferedAt = Math.max(next.lastOfferedAt,now);
  if (action.kind === 'save' || action.kind === 'unsave') {
    next.saved = action.kind === 'save';
    if (next.saved) next.savedAt = now;
  } else if (action.kind === 'investigate') {
    next.investigatedAt = now;
    next.investigationVersion = action.contentVersion;
  }
  return next;
}

export function createPortalTrailEntry(ownerScope, destinationId) {
  return {type:'PortalTrailEntry',schemaVersion:PORTAL_TRAIL_VERSION,
    id:portalTrailKey(ownerScope,destinationId),ownerScope,destinationId,
    state:emptyPortalTrailState(destinationId),pending:{}};
}

export function validatePortalTrailEntry(input) {
  if (!input || input.type !== 'PortalTrailEntry' || input.schemaVersion !== PORTAL_TRAIL_VERSION ||
      input.id !== portalTrailKey(input.ownerScope,input.destinationId) || !input.pending ||
      typeof input.pending !== 'object' || Array.isArray(input.pending)) throw new TypeError('Invalid Trail cache record.');
  const state = validatePortalTrailState(input.state,input.destinationId);
  const pending = {};
  for (const [slot,value] of Object.entries(input.pending)) {
    const action = normalizePortalAction(value);
    if (action.destinationId !== input.destinationId || actionSlots[action.kind] !== slot ||
        input.ownerScope === 'device-guest') throw new TypeError('Invalid pending Trail action.');
    pending[slot] = action;
  }
  return {...createPortalTrailEntry(input.ownerScope,input.destinationId),state,pending};
}

export function queuePortalAction(entry, input) {
  const next = validatePortalTrailEntry(entry), action = normalizePortalAction(input);
  if (action.destinationId !== next.destinationId) throw new TypeError('Portal action changed destination.');
  if (next.ownerScope === 'device-guest') next.state = applyPortalAction(next.state,action);
  else next.pending[actionSlots[action.kind]] = action;
  return next;
}

export function portalTrailView(entry) {
  const next = validatePortalTrailEntry(entry);
  let state = next.state;
  for (const action of Object.values(next.pending).sort((a,b) => a.createdAt-b.createdAt || a.operationId.localeCompare(b.operationId))) {
    state = applyPortalAction(state,action);
  }
  return {...state,pending:Object.keys(next.pending).length > 0,ownerScope:next.ownerScope};
}

export function acceptPortalSync(entry, response, expectedOwnerScope) {
  const next = validatePortalTrailEntry(entry);
  if (expectedOwnerScope !== next.ownerScope || response?.ownerScope !== next.ownerScope ||
      response?.state?.destinationId !== next.destinationId) throw new TypeError('Trail synchronization changed account or place.');
  const state = validatePortalTrailState(response.state,next.destinationId);
  // An older reply may acknowledge its exact operation, but cannot replace a
  // newer accepted state or clear a user's newer queued save/unsave choice.
  if (state.revision >= next.state.revision) next.state = state;
  for (const [slot,action] of Object.entries(next.pending)) {
    if (action.operationId === response.operationId) delete next.pending[slot];
  }
  return next;
}

export function portalTrailSummary(entries) {
  const views = entries.map(portalTrailView);
  return {offered:views.filter(row=>row.firstOfferedAt>0).length,saved:views.filter(row=>row.saved).length,
    investigated:views.filter(row=>row.investigatedAt>0).length,visited:views.filter(row=>row.visitedAt>0).length,
    expeditions:new Set(views.flatMap(row=>row.expeditionIds)).size,pending:views.filter(row=>row.pending).length};
}

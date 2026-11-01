import {validateLunarHomecomingBackup} from '../campaign/lunar-homecoming.js';
import {validateInvestigationBackup} from '../campaign/coastal-investigation.js';
import {validateCoastalBackup} from '../campaign/coastal-departure.js';
import { THREE_VIEWS, validateThreeViewsBackup } from '../campaign/three-views.js';
import {HOME_ACHIEVEMENTS} from '../campaign/home-achievements.js';
import { HARBOR_RUN, normalizeHarborRun, validateDeliveryRoute } from '../campaign/harbor-run.js';
import { validHandling, deliveryDistinction } from '../campaign/delivery-handling.js';
import {validatePortalTrailEntry} from '../portal/trail-model.js';
// Validate the entire file before opening a destructive replacement transaction.
// Older backups may omit optional collections, but malformed rows are never dropped.
import { FIRST_BEARINGS, normalizeOpeningChapter, finishOpeningChapter } from '../campaign/first-bearings.js?v=1';
export function validateJournalBackup(input) {
  const fail = () => { throw new TypeError('This Journal backup is incomplete, damaged, or from an unsupported version. Existing records have not been changed.'); };
  if (!input || typeof input !== 'object' || !input.profile || typeof input.profile !== 'object' || Array.isArray(input.profile)) fail();
  if (input.schemaVersion != null && (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1 || input.schemaVersion > 5)) fail();
  if (input.profile.id != null && input.profile.id !== 'local-explorer') fail();
  const data = JSON.parse(JSON.stringify(input));
  if(Object.hasOwn(data,'portalTrail')) {
    if(!Array.isArray(data.portalTrail))fail();
    const ids=new Set();
    for(const row of data.portalTrail){
      try{validatePortalTrailEntry(row);}catch{fail();}
      if(ids.has(row.id))fail();ids.add(row.id);
    }
  }
  for (const [name, key, required, catalog] of [['events','eventId',true,false],['fieldGuide','catalogId',true,false],['items','instanceId',false,true],['companions','instanceId',false,true]]) {
    if (data[name] == null && !required) data[name] = [];
    if (!Array.isArray(data[name])) fail();
    const ids = new Set();
    for (const row of data[name]) {
      if (!row || typeof row[key] !== 'string' || !row[key].trim() || ids.has(row[key])) fail();
      if (catalog && (typeof row.catalogId !== 'string' || !row.catalogId.trim())) fail();
      if (row.claimId != null && (typeof row.claimId !== 'string' || !row.claimId.trim())) fail();
      ids.add(row[key]);
    }
  }
  for (const rows of [data.events,data.items]) {
    const claims = new Set();
    for (const row of rows) if (row.claimId) { if (claims.has(row.claimId)) fail(); claims.add(row.claimId); }
  }
  try{validateCoastalBackup(data.events);validateInvestigationBackup(data.events);validateLunarHomecomingBackup(data.profile,data.events);}catch{fail();}
  const chapter = normalizeOpeningChapter(data.profile.openingChapter);
  for(const [kind,entry] of Object.entries(data.profile.homeAchievements||{})) {
    const definition=HOME_ACHIEVEMENTS[kind],receipt=data.events.find(event=>event.eventId===entry?.eventId);
    if(!definition || entry?.eventId!==`event:campaign:${definition.id}:v1` || !(entry.occurredAt>0) || !entry.metadata?.homeId || !receipt || receipt.eventType!=='campaign-completed' || receipt.metadata?.homeId!==entry.metadata.homeId)fail();
  }
  if (chapter.schemaVersion === 1 && ['review', 'complete'].includes(chapter.phase)) {
    const evidence = data.events.find(event => event.eventId === chapter.eventId);
    try { finishOpeningChapter({ ...chapter, completedAt: 0 }, evidence); } catch { fail(); }
    if (chapter.phase === 'complete' && !data.events.some(event => event.eventId === FIRST_BEARINGS.receiptId
      && event.eventType === 'campaign-completed' && event.metadata?.evidenceEventId === chapter.eventId)) fail();
  }
  const delivery = normalizeHarborRun(data.profile.harborRun);
  if (delivery.schemaVersion === 1 && delivery.phase !== 'available') {
    try { validateDeliveryRoute(delivery.route); } catch { fail(); }
    if (delivery.finishId != null && (delivery.phase !== 'complete' || !['white', 'slate'].includes(delivery.finishId))) fail();
    if (delivery.handling != null && !validHandling(delivery.handling)) fail();
    if (delivery.distinction != null && (delivery.phase !== 'complete' || delivery.distinction !== deliveryDistinction(delivery.handling, delivery.route.distance))) fail();
    if (!['pickup', 'driving', 'unload', 'complete'].includes(delivery.phase) || !Number.isInteger(delivery.nextPoint)
        || delivery.nextPoint < 0 || delivery.nextPoint > delivery.route.points.length) fail();
    if (delivery.phase === 'pickup' && (delivery.cargo !== 'at-pickup' || delivery.nextPoint !== 0)) fail();
    if (['driving', 'unload'].includes(delivery.phase) && (delivery.cargo !== 'in-vehicle' || !(delivery.loadedAt > 0))) fail();
    if (delivery.phase === 'driving' && delivery.nextPoint >= delivery.route.points.length) fail();
    if (delivery.phase === 'unload' && delivery.nextPoint !== delivery.route.points.length) fail();
    if (delivery.phase === 'complete' && (!delivery.completedAt || delivery.cargo !== 'delivered'
        || delivery.nextPoint !== delivery.route.points.length || !data.events.some(event => event.eventId === HARBOR_RUN.receiptId
        && event.metadata?.routeId === delivery.route.id && event.eventType === 'campaign-completed'))) fail();
  }
  if(data.albums==null)data.albums=[];
  if(!Array.isArray(data.albums)||data.albums.length>1||data.albums.some(a=>a?.id!==THREE_VIEWS.albumId))fail();
  try{validateThreeViewsBackup(data.profile.threeViews,data.albums[0],data.events);}catch{fail();}
  return data;
}

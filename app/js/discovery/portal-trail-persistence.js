import {
  acceptPortalSync, createPortalTrailEntry, normalizePortalAction, portalTrailKey,
  queuePortalAction, validatePortalTrailEntry, normalizePortalGameVisit, queuePortalGameVisit
} from '../portal/trail-model.js';

// These methods extend the existing Journal persistence owner. The adapters
// supply atomic profiles-store changes; this module opens no other database.
export function createPortalTrailPersistence({read,update,page}) {
  return Object.freeze({
    async getPortalDestination(ownerScope,destinationId) {
      const key=portalTrailKey(ownerScope,destinationId);
      const entry=await read(key);
      return validatePortalTrailEntry(entry||createPortalTrailEntry(ownerScope,destinationId));
    },
    async recordPortalAction(ownerScope,input) {
      const action=normalizePortalAction(input),key=portalTrailKey(ownerScope,action.destinationId);
      return update(key,existing=>queuePortalAction(existing||createPortalTrailEntry(ownerScope,action.destinationId),action));
    },
    async recordPortalGameVisit(ownerScope,input){
      const visit=normalizePortalGameVisit(input),key=portalTrailKey(ownerScope,visit.destinationId);
      return update(key,existing=>queuePortalGameVisit(existing||createPortalTrailEntry(ownerScope,visit.destinationId),visit));
    },
    async acceptPortalTrailSync(ownerScope,response) {
      const destinationId=response?.state?.destinationId,key=portalTrailKey(ownerScope,destinationId);
      return update(key,existing=>acceptPortalSync(existing||createPortalTrailEntry(ownerScope,destinationId),response,ownerScope));
    },
    async listPortalTrail(ownerScope,{after=null,limit=50}={}) {
      portalTrailKey(ownerScope,after===null?'validation':after);
      if(!Number.isInteger(limit)||limit<1||limit>100)throw new TypeError('Trail pages contain 1–100 places.');
      const rows=await page(ownerScope,after,limit+1);
      const items=rows.slice(0,limit).map(validatePortalTrailEntry);
      return {items,nextCursor:rows.length>limit?items.at(-1).destinationId:null};
    }
  });
}

export function portalTrailProfileRows(profiles) {
  return profiles.filter(row=>row?.type==='PortalTrailEntry').map(validatePortalTrailEntry);
}

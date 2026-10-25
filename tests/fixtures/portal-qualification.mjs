import {PORTAL_CATALOG} from '../../app/js/portal/catalog.js';
import {PORTAL_RENDER_CONTRACT} from '../../app/js/portal/game-intent.js';
import {PORTAL_QUALITY_CHECKS} from '../../app/js/earth-core/portal-destination-policy.js';
// Controlled qualification for integration only. Never published as approval.
export function portalFixture({now=1800000000000,deviceProfile='desktop'}={}){
  const catalog=structuredClone(PORTAL_CATALOG),place=catalog.destinations[0],d=place.destination;
  const qualification={type:'PortalQualification',schemaVersion:1,status:'approved',destinationId:d.id,
    destinationRevision:d.revision,kind:d.kind,contentVersion:d.contentVersion,renderContractVersion:PORTAL_RENDER_CONTRACT,
    origin:d.origin,bounds:d.bounds,arrival:d.arrival,deviceProfile,testedBuildId:'controlled-fixture',
    checkedAt:now-1000,validUntil:now+10000,evidenceId:'fixture:portal-entry',
    checks:Object.fromEntries(PORTAL_QUALITY_CHECKS.map(key=>[key,'passed'])),
    layers:Object.fromEntries(['terrain','transport','buildings','places'].map(key=>[key,'verified'])),experienceIds:d.experienceIds};
  catalog.qualifications=[qualification];return {catalog,place,qualification,now};
}

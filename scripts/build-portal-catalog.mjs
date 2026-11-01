import fs from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {PORTAL_CATALOG} from '../app/js/portal/catalog.js';
import {PORTAL_RENDER_CONTRACT,portalGameLink,portalOffer} from '../app/js/portal/game-intent.js';
const root=fileURLToPath(new URL('../',import.meta.url));
export function nativePortalCatalog(catalog=PORTAL_CATALOG){
  const offers=catalog.qualifications.flatMap(qualification=>{
    const place=catalog.destinations.find(row=>row.id===qualification.destinationId);
    if(!portalOffer(place,catalog,{now:qualification.checkedAt,deviceProfile:qualification.deviceProfile,evidenceId:qualification.evidenceId}).decision.eligible)return [];
    return [{destinationId:place.id,destinationRevision:place.destination.revision,deviceProfile:qualification.deviceProfile,
      contentVersion:place.destination.contentVersion,renderContractVersion:PORTAL_RENDER_CONTRACT,
      checkedAt:qualification.checkedAt,validUntil:qualification.validUntil,evidenceId:qualification.evidenceId}];
  });
  return {...catalog,renderContractVersion:PORTAL_RENDER_CONTRACT,offers,
    destinations:catalog.destinations.map(place=>({...place,gameLink:portalGameLink(place)}))};
}
export async function buildPortalCatalog({write=true}={}){
  const text=JSON.stringify(nativePortalCatalog(),null,2)+'\n';
  if(write)for(const name of ['portal/catalog.json','android/app/src/main/assets/portal-catalog.json','apple/Shared/Resources/portal-catalog.json']){
    const target=path.join(root,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,text);
  }
  return text;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await buildPortalCatalog();

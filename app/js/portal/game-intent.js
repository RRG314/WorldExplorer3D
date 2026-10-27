import {evaluatePortalOffer} from '../earth-core/portal-destination-policy.js';

// Versioned with affected Earth presentation/content contracts, not URL input.
export const PORTAL_RENDER_CONTRACT='earth-main:2026.10.27.1';
export function portalDeviceProfile(host=globalThis){
  return host.matchMedia?.('(pointer: coarse)').matches===true?'mobile-touch':'desktop';
}
export function portalOffer(place,catalog,context={}){
  const qualification=catalog?.qualifications?.find(row=>row.destinationId===place?.id&&
    row.deviceProfile===context.deviceProfile&&row.evidenceId===(context.evidenceId??row.evidenceId));
  const decision=evaluatePortalOffer(place?.destination,qualification,{...context,
    renderContractVersion:PORTAL_RENDER_CONTRACT,contentVersion:place?.destination?.contentVersion});
  return {place,qualification,decision};
}
export function portalGameLink(place){
  return `/app/?portal=${encodeURIComponent(place.id)}&pr=${encodeURIComponent(place.destination.revision)}`;
}
export function resolvePortalGameIntent(search,catalog,context){
  const params=new URLSearchParams(search);
  if(!params.has('portal'))return null;
  // A Portal is an opaque catalog intent. Coordinates, seeds, poses, rooms or
  // alternate launch modes cannot be composed into an approved destination.
  if(params.getAll('portal').length!==1||params.getAll('pr').length!==1||
    [...params.keys()].some(key=>!['portal','pr','distribution','graphicsDiagnostics'].includes(key))){
    return {decision:{eligible:false,reasons:['conflicting-portal-intent']}};
  }
  const place=catalog.destinations.find(row=>row.id===params.get('portal'));
  if(!place||place.destination.revision!==params.get('pr'))return {decision:{eligible:false,reasons:['unknown-portal-revision']}};
  return portalOffer(place,catalog,context);
}

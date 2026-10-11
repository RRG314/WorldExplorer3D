import {validateOceanVoyage} from '../ocean/voyage-store.js';

// Coordinates alone do not specify a travel mode or even an astronomical body.
export function journalReturnDestination(event,locations={}) {
  if(!event)return null;
  const environment=String(event.environment||'EARTH').toUpperCase();
  if(environment==='OCEAN'){
    const voyage=validateOceanVoyage(event.metadata?.voyage);
    return voyage?{kind:'ocean-voyage',voyage,label:'Return to research voyage'}:null;
  }
  if(environment!=='EARTH')return null;
  const key=String(event.locationKey||''),location=event.locationSnapshot;
  if(key&&Object.hasOwn(locations,key))return {kind:'earth-preset',key,label:'Return to location'};
  if(!location||![location.lat,location.lon].every(Number.isFinite)||Math.abs(location.lat)>90||Math.abs(location.lon)>180)return null;
  return {kind:'earth-coordinate',location:{lat:location.lat,lon:location.lon,name:location.name||event.regionLabel||'Saved place'},label:'Return to location'};
}

export async function returnToJournalRecord(ctx,event) {
  const destination=journalReturnDestination(event,ctx.LOCS);
  if(!destination||ctx.sharedMarine?.active)return false;
  try {
    if(destination.kind==='ocean-voyage')return !!await ctx.oceanVoyage?.resume(destination.voyage);
    if(typeof ctx.loadRoads!=='function'||typeof ctx.spawnOnRoad!=='function')return false;
    if(destination.kind==='earth-preset'&&typeof ctx.selectPresetLocation!=='function')return false;
    if(destination.kind==='earth-coordinate'&&typeof ctx.setCustomLocation!=='function')return false;
    // Restore the actor and retire the previous environment through the same
    // authority as the Earth menu. It restores selection too, so apply the
    // Journal destination only after this handoff has finished.
    if(ctx.getEnv?.()!=='EARTH'){
      if(typeof ctx.returnToEarthFromMenu!=='function'||!await ctx.returnToEarthFromMenu()||ctx.getEnv?.()!=='EARTH')return false;
    }
    if(destination.kind==='earth-preset'){
      if(String(ctx.selLoc)===destination.key&&ctx.getEnv?.()==='EARTH'){ctx.showToast?.(`Already exploring ${event.regionLabel||'this location'}`);return true;}
      ctx.selectPresetLocation(destination.key);
    }else{
      ctx.setCustomLocation(destination.location,{transient:false});
    }
    const loaded=await ctx.loadRoads();if(loaded===false)return false;
    ctx.spawnOnRoad();ctx.showToast?.(`Returned to ${event.regionLabel||destination.location?.name||'saved place'}`);return true;
  }catch{return false;}
}

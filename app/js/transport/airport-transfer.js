// Existing airport journeys are destination transfers followed by a local
// flight. Only an accepted world and successful vehicle entry may record one.
async function completeAirportTransfer(appCtx,{destination,role='pilot',vehicleCatalogId='personal-prop'}) {
  const lat=Number(destination?.lat),lon=Number(destination?.lon);
  if (destination?.lat==null||destination?.lon==null||destination.lat===''||destination.lon===''||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)throw new Error('Choose a valid Earth destination.');
  const same=Number.isFinite(Number(appCtx.LOC?.lat))&&Number.isFinite(Number(appCtx.LOC?.lon))&&Math.hypot(lat-Number(appCtx.LOC.lat),lon-Number(appCtx.LOC.lon))<.001;
  if (appCtx.setTravelMode?.('walk',{source:'airport_transfer_prepare',force:true,emitTutorial:false})!=='walk')throw new Error('Leave your current activity before starting a flight.');
  if (!same) {
    if(typeof appCtx.setCustomLocation!=='function'||typeof appCtx.loadRoads!=='function')throw new Error('Destination travel is not ready yet.');
    appCtx.setCustomLocation({lat,lon,name:destination.name,countryCode:destination.countryCode,arrivalMode:'walk',locationDetails:{
      region:destination.region,country:destination.country,displayName:destination.displayName,airportClass:destination.airportClass||'',isAirport:destination.isAirport===true,airportBounds:destination.airportBounds||null,iata:destination.iata||'',icao:destination.icao||''
    }},{transient:false});
    const publication=await appCtx.loadRoads();
    if(publication?.state!=='published')throw new Error('The destination did not finish loading. Choose a location to retry.');
  }
  if(!Number.isFinite(Number(appCtx.LOC?.lat)) || !Number.isFinite(Number(appCtx.LOC?.lon)) || Math.hypot(Number(appCtx.LOC?.lat)-lat,Number(appCtx.LOC?.lon)-lon)>=.001 || appCtx.worldLoading || appCtx.worldLoadRuntimeState?.status==='failed')throw new Error('The destination changed before the flight was ready.');
  const layout=appCtx.aviationRuntime?.airportLayout,center=layout?.center||{x:0,z:0};
  const ground=appCtx.SurfaceQuery?.terrainAt?.(center.x,center.z)?.position?.y ?? appCtx.elevationWorldYAtWorldXZ?.(center.x,center.z);
  if(typeof ground!=='number'||!Number.isFinite(ground))throw new Error('The destination ground is not ready for a flight.');
  const started=appCtx.setTravelMode?.('plane',{source:'airport_destination_arrival',force:true,x:center.x,y:ground+(role==='passenger'?125:92),z:center.z,yaw:layout?.yaw||0,speed:role==='passenger'?58:42,throttle:.68,airborne:true,transportCatalogId:vehicleCatalogId,transportEntityId:`airport-arrival:${vehicleCatalogId}`,airportPassenger:role==='passenger',airportTourCenter:center})==='plane';
  if(!started)throw new Error('The aircraft could not start. Your arrival has not been recorded.');
  let journalSaved=false;
  try {
    const event=await appCtx.recordExplorerEvent?.({eventId:`airport-arrival:${new Date().toISOString().slice(0,10)}:${lat.toFixed(4)}:${lon.toFixed(4)}`,eventType:'vehicle-route-completed',activityId:'airport-travel',pathId:'travel',name:`Arrived by air in ${destination.name}`,detail:role==='pilot'?'Transferred to the destination and took the flight controls.':'Transferred to the destination and joined a passenger flight.',family:'airport-travel',sourceId:`${lat.toFixed(4)}:${lon.toFixed(4)}`,firstCompletion:true,metadata:{vehicleClass:'aircraft',role,journeyKind:'destination-transfer'}});
    journalSaved=!!event?.event;
  } catch { /* Flight remains valid; report the failed save without replaying it. */ }
  return {started:true,journalSaved};
}
export {completeAirportTransfer};

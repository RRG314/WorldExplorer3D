import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoatOceanTransferApi} from '../app/js/boat-mode/ocean-transfer.js';
import {ensureOceanVoyage} from '../app/js/ocean/voyage.js';
import {createOceanVoyageStore,OCEAN_VOYAGE_KEY} from '../app/js/ocean/voyage-store.js';

function fixture(){
 const values=new Map(),calls=[],storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 let generation=0,load=async()=>{},accept=true;
 const ctx={LOC:{lat:39,lon:-76},customLoc:{lat:39,lon:-76,name:'Original city'},SCALE:100000,ENV:{EARTH:'EARTH'},boatMode:{active:false},boat:{x:0,z:0,angle:0},oceanMode:{active:false},getEnv:()=> 'EARTH',
  setCustomLocation(value){this.customLoc=value;},commitEnvironment(){generation++;},
  showTransitionLoad:()=>load(),setPlanetaryCharacter:async()=>{},boatDeck:{enter:()=>{calls.push('deck');return true;}},
  startOceanMode:()=>{throw Error('Fresh surface entry must not allocate an underwater session');}};
 const voyage=ensureOceanVoyage(ctx,{store:createOceanVoyageStore({storage})});
 const api=createBoatOceanTransferApi({appCtx:ctx,
  captureEarthWorldSession(){calls.push(['capture',ctx.LOC.lat,ctx.customLoc.name]);},
  captureEnvironmentSession(){const captured=generation;return{isCurrent:()=>captured===generation};},
  buildSyntheticBoatCandidate:()=>({spawnX:0,spawnZ:0,waterKind:'open_ocean',source:{synthetic:true}}),
  startBoatMode(opts){calls.push('boat');if(!accept)return false;Object.assign(ctx.boatMode,{active:true,transportEntityId:opts.transportEntityId,transportCatalogId:opts.transportCatalogId});return true;},
  setPromptSignature(){},showBoatPrompt(){},hideBoatPrompt(){},resetBoatDynamics(){},resetBoatFoamFx(){},updateBoatMenuUi(){},updateWaterWaveVisuals(){}});
 return{ctx,api,calls,storage,voyage,supersede:()=>generation++,setLoad:fn=>load=fn,rejectBoat:()=>accept=false};
}
const site={lat:10,lon:20,name:'Verified sea',region:'Ocean'},entry={lat:10,lon:20,source:'gebco-elevation-sample',kind:'modeled-ocean',elevationMeters:-50};
async function withDocument(fn){const original=globalThis.document;globalThis.document={getElementById:()=>null};try{await fn();}finally{globalThis.document=original;}}

test('fresh surface entry validates water before mutating the location, scene or voyage',()=>withDocument(async()=>{
 const f=fixture();
 for(const options of [{launchSite:site},{launchSite:site,entry:{...entry,lon:21}},{launchSite:site,entry:{...entry,elevationMeters:-1}}])assert.equal(await f.api.startSurfaceResearchVoyage(options),false);
 assert.deepEqual(f.calls,[]);assert.equal(f.storage.getItem(OCEAN_VOYAGE_KEY),null);assert.equal(f.ctx.LOC.lat,39);
 assert.equal(await f.api.startSurfaceResearchVoyage({launchSite:site,entry}),true);
 assert.deepEqual(f.calls,[['capture',39,'Original city'],'boat','deck']);
 assert.equal(f.ctx.oceanMode.active,false);assert.equal(f.ctx.boatMode.moored,true);assert.equal(f.ctx.LOC.lat,10);
 assert.equal(f.voyage.saved.stage,'aboard');assert.equal(f.voyage.saved.ship.transportEntityId,f.ctx.boatMode.transportEntityId);
 assert.equal(f.voyage.saved.subId,`sub:${f.ctx.boatMode.transportEntityId}`);
}));

test('superseded or duplicated surface requests cannot publish a vessel or overwrite a save',()=>withDocument(async()=>{
 const f=fixture();let release;f.setLoad(()=>new Promise(r=>release=r));
 const pending=f.api.startSurfaceResearchVoyage({launchSite:site,entry});
 assert.equal(await f.api.startSurfaceResearchVoyage({launchSite:site,entry}),false);
 f.supersede();release();assert.equal(await pending,false);
 assert.deepEqual(f.calls,[['capture',39,'Original city']]);assert.equal(f.ctx.LOC.lat,39);assert.equal(f.storage.getItem(OCEAN_VOYAGE_KEY),null);
}));

test('failed surface allocation restores the original Earth frame and preserves voyage bytes',()=>withDocument(async()=>{
 const f=fixture();f.rejectBoat();f.storage.setItem(OCEAN_VOYAGE_KEY,'future-format-retain');
 assert.equal(await f.api.startSurfaceResearchVoyage({launchSite:site,entry}),false);
 assert.deepEqual(f.ctx.LOC,{lat:39,lon:-76});assert.equal(f.ctx.customLoc.name,'Original city');
 assert.equal(f.storage.getItem(OCEAN_VOYAGE_KEY),'future-format-retain');assert.equal(f.voyage.current,null);
}));

test('future local saves survive a successful new session; no pretend durable save',()=>withDocument(async()=>{
 const f=fixture();f.storage.setItem(OCEAN_VOYAGE_KEY,'future-format-retain');
 assert.equal(await f.api.startSurfaceResearchVoyage({launchSite:site,entry}),true);
 assert.equal(f.storage.getItem(OCEAN_VOYAGE_KEY),'future-format-retain');assert.equal(f.voyage.saved,null);assert.match(f.voyage.status,/not saved/);
}));

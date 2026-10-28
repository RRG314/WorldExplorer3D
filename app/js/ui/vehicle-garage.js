import {ctx} from '../shared-context.js?v=55';
import {PERSONAL_VEHICLES,personalVehicleIdentity} from '../transport/vehicle-garage-rules.js';
import {getCurrentUser} from '../../../js/auth-ui.js?v=56';
import {VEHICLE_UPGRADE_DEFINITIONS} from '../transport/vehicle-upgrades.js?v=1';
const messages={garage_loading:'Your account garage is loading. Please try again in a moment.',vehicle_not_owned:'Buy this vehicle before selecting it.',stop_before_switching:'Stop your vehicle before switching.',
  no_safe_road:'No clear driving surface nearby. Move onto a road and try again.',vehicle_model_unavailable:'That model could not load. Your current vehicle is unchanged.',
  vehicle_garage_changed:'Your garage changed on another session. Please try again.',not_enough_credits:'You need more Explorer Credits.',
  leave_current_vehicle_or_interior:'Leave the current aircraft, vessel or interior first.',world_changed:'The world changed. Please choose your vehicle again.'};
export function vehicleGarageMessage(result){return result?.ok?'Vehicle ready.':messages[result?.reason]||'This vehicle action could not complete. Please try again.';}
let dialog,picked='bmw_e34',busy=false,returnFocus,driveReady=false,closeMenus=()=>{},requestWorldFocus=()=>{};
function refreshTravel(){
  const select=document.getElementById('travelVehicleSelect');let garage;
  try{garage=ctx.getVehicleGarage?.();}catch{return;}
  if(!select||!garage)return;
  select.replaceChildren(...PERSONAL_VEHICLES.filter(v=>garage.vehicles[v.id]).map(v=>new Option(v.label,v.id)));
  select.value=garage.selectedId;
}
function status(text){dialog.querySelector('[data-garage-status]').textContent=text;}
function render(){
  let garage;try{garage=ctx.getVehicleGarage?.();}catch{
    status('Your saved garage could not be read. Your collection has been preserved. Close this panel and try again.');
    for(const control of dialog.querySelectorAll('button,select'))if(!control.hasAttribute('data-garage-close'))control.disabled=true;
    return;
  }
  if(!garage)return;
  const list=dialog.querySelector('[data-garage-list]');list.replaceChildren();
  for(const definition of PERSONAL_VEHICLES){
    const row=garage.vehicles[definition.id],button=document.createElement('button');button.type='button';button.className='vehicle-garage-row';
    button.dataset.vehicleId=definition.id;button.setAttribute('aria-pressed',String(picked===definition.id));
    const name=document.createElement('strong'),detail=document.createElement('span');name.textContent=definition.label;
    detail.textContent=`${definition.category} · ${row?`Owned · ${Math.round(row.condition*100)}% condition`:definition.price.toLocaleString()+' Explorer Credits'}`;
    button.append(name,detail);list.append(button);
  }
  const definition=PERSONAL_VEHICLES.find(v=>v.id===picked)||PERSONAL_VEHICLES[0],row=garage.vehicles[picked];
  dialog.querySelector('[data-garage-title]').textContent=definition.label;
  const levels=ctx.vehicleUpgradeStore?.levels({vehicleIdentity:personalVehicleIdentity(picked)})||{};
  dialog.querySelector('[data-garage-detail]').textContent=row?
    `${Math.round(row.condition*100)}% condition. ${VEHICLE_UPGRADE_DEFINITIONS.map(u=>`${u.label}: ${levels[u.id]||0}/3`).join(' · ')}. Visit a mapped mechanic for repairs and upgrades.`:
    'Add this vehicle to your collection with Explorer Credits. It stays available when you travel to another location.';
  const buy=dialog.querySelector('[data-garage-buy]'),drive=dialog.querySelector('[data-garage-drive]');
  buy.hidden=!!row;buy.textContent=`Buy · ${definition.price.toLocaleString()} Credits`;drive.disabled=!row||busy;
  const home=dialog.querySelector('[data-garage-home]');home.replaceChildren(new Option('Personal garage — no home assigned',''));
  for(const h of ctx.getVehicleGarageHomes?.()||[])home.add(new Option(h.label||h.name||'Owned home',h.worldPropertyId||h.id));
  home.value=row?.homeId||'';home.disabled=!row||busy;
  dialog.querySelector('[data-garage-scope]').textContent=getCurrentUser()?'Saved with your Explorer account':'Saved on this device. Sign in to use your account garage.';
  for(const b of dialog.querySelectorAll('button'))if(!b.hasAttribute('data-garage-close'))b.disabled=busy||(b===drive&&!row);
  refreshTravel();
}
export function openVehicleGarage(){
  let garage;try{garage=ctx.getVehicleGarage?.();}catch{
    ctx.showToast?.('Your saved garage could not be read. Your collection has been preserved.');return;
  }
  if(!garage){ctx.showToast?.('Start a location before opening your garage.');return;}
  ensure();returnFocus=document.activeElement;driveReady=false;picked=garage.selectedId;status('');render();
  closeMenus();
  ctx.clearControlInputState?.('vehicle_garage');ctx.setPauseReason?.('vehicle-garage',true);dialog.showModal();
}
function ensure(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.className='vehicle-garage';dialog.id='vehicleGarage';dialog.setAttribute('aria-labelledby','vehicleGarageHeading');
  dialog.innerHTML=`<header><div><p>WORLD EXPLORER</p><h2 id="vehicleGarageHeading">Your garage</h2></div><button type="button" data-garage-close aria-label="Close garage">Close</button></header>
    <p data-garage-scope></p><div class="vehicle-garage-layout"><nav aria-label="Vehicle collection" data-garage-list></nav><section aria-labelledby="garageVehicleName">
    <h3 id="garageVehicleName" data-garage-title></h3><p data-garage-detail></p>
    <label>Keep at home<select data-garage-home aria-label="Vehicle storage home"></select></label>
    <p>Home storage keeps a vehicle in your collection. Delivery still needs clear, supported road space outside.</p>
    <div class="vehicle-garage-actions"><button type="button" data-garage-buy>Buy</button><button type="button" data-garage-drive>Drive this vehicle</button></div>
    <p role="status" aria-live="polite" data-garage-status></p></section></div>`;
  document.body.append(dialog);
  dialog.querySelector('[data-garage-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('keydown',event=>{if(event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();dialog.close();}});
  dialog.addEventListener('close',()=>{ctx.cancelPersonalVehicleSelection?.();ctx.setPauseReason?.('vehicle-garage',false);ctx.clearControlInputState?.('vehicle_garage_closed');
    if(driveReady){driveReady=false;requestWorldFocus();return;}
    const focus=returnFocus?.getClientRects?.().length?returnFocus:document.getElementById('travelBtn');focus?.focus?.({preventScroll:true});});
  dialog.querySelector('[data-garage-list]').addEventListener('click',e=>{const b=e.target.closest('[data-vehicle-id]');if(!b||busy)return;picked=b.dataset.vehicleId;render();status('');});
  const run=async action=>{
    if(busy)return;busy=true;render();status(action==='drive'?'Preparing your vehicle…':'Saving your garage…');
    let result;
    try{result=action==='drive'?await ctx.selectPersonalVehicle?.(picked):await ctx.changeVehicleGarage?.({action,vehicleId:picked,homeId:dialog.querySelector('[data-garage-home]').value});}
    catch{result={ok:false};}
    busy=false;render();status(vehicleGarageMessage(result));
    if(result?.ok&&action==='drive'){driveReady=true;dialog.close();}
  };
  dialog.querySelector('[data-garage-drive]').addEventListener('click',()=>void run('drive'));
  dialog.querySelector('[data-garage-buy]').addEventListener('click',()=>void run('buy'));
  dialog.querySelector('[data-garage-home]').addEventListener('change',()=>void run('home'));
}
export function bindVehicleGarage(options={}){
  closeMenus=options.closeMenus||closeMenus;
  requestWorldFocus=options.requestWorldFocus||requestWorldFocus;
  document.getElementById('fGarage')?.addEventListener('click',openVehicleGarage);
  document.getElementById('travelBtn')?.addEventListener('click',refreshTravel);
  ctx.openVehicleGarage=openVehicleGarage;
}

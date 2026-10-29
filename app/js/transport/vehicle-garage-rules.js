import {VEHICLE_CATALOG} from '../engine/vehicle-catalog.js?v=6';

// Shared portable acquisition rules. A garage is part of the existing Explorer
// economy/player record; it does not grant race rank or invent another wallet.
const prices={compact:8000,sedan:14000,suv:24000,pickup:22000,van:19000,delivery_van:26000,taxi:18000,
  box_truck:48000,city_bus:90000,delorean:55000,cadillac_coupe:22000,cadillac_fleetwood:26000,golf_ii:9000,datsun_280z:34000};
export const PERSONAL_VEHICLES=Object.freeze([
  Object.freeze({id:'bmw_e34',label:'BMW 525i E34',variantId:'sedan',assetId:'vehicle-bmw-525i-e34',price:0,category:'Personal sedan',defaultVisual:true}),
  ...VEHICLE_CATALOG.map(v=>Object.freeze({id:v.id,label:v.label,variantId:v.id,assetId:v.assetId||'',
    price:prices[v.id],category:v.category||v.bodyStyle,defaultVisual:false}))
]);
export function personalVehicleById(id){return PERSONAL_VEHICLES.find(v=>v.id===id)||null;}
export function personalVehicleIdentity(id){return id==='bmw_e34'?'player-default:sedan':`personal-vehicle:${id}`;}
export function normalizeVehicleGarage(raw){
  if(raw&&raw.schemaVersion!==1)throw Error('Unsupported saved vehicle garage');
  const vehicles={};
  for(const [id,row] of Object.entries(raw?.vehicles||{})){
    if(!personalVehicleById(id)||!row||!Number.isFinite(row.condition))throw Error('Invalid saved vehicle');
    vehicles[id]={...row,id,condition:Math.max(0,Math.min(1,row.condition)),homeId:String(row.homeId||'')};
  }
  vehicles.bmw_e34||={id:'bmw_e34',condition:1,homeId:'',acquiredAt:0};
  const selectedId=vehicles[raw?.selectedId]?raw.selectedId:'bmw_e34';
  return {schemaVersion:1,revision:Math.max(0,Number(raw?.revision)||0),selectedId,vehicles};
}
export function prepareVehicleGarageChange(raw,command={},context={}){
  const garage=normalizeVehicleGarage(raw),definition=personalVehicleById(command.vehicleId);
  if(!definition)throw Error('vehicle_not_available');
  if(command.expectedRevision!==garage.revision)throw Error('vehicle_garage_changed');
  const row=garage.vehicles[definition.id];let cost=0;
  if(command.action==='buy'){
    if(row)throw Error('vehicle_already_owned');
    cost=definition.price;
    garage.vehicles[definition.id]={id:definition.id,condition:1,homeId:'',acquiredAt:context.now||Date.now()};
  }else if(!row)throw Error('vehicle_not_owned');
  else if(command.action==='select')garage.selectedId=definition.id;
  else if(command.action==='park'){
    if(!Number.isFinite(command.condition)||command.condition<0||command.condition>1)throw Error('invalid_vehicle_condition');
    row.condition=Math.min(row.condition,command.condition);
  }else if(command.action==='home'){
    const homeId=String(command.homeId||'');
    if(homeId&&!context.ownsHome?.(homeId))throw Error('vehicle_home_not_owned');
    row.homeId=homeId;
  }else throw Error('invalid_vehicle_action');
  garage.revision++;
  return {garage,cost};
}

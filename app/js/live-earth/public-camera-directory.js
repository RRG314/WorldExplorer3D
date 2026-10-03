import {CAMERA_PROVIDER,createPublicCameraService} from './public-camera-service.js';
import {CALTRANS_PROVIDER,createCaltransCameraService} from './caltrans-camera-service.js';
export const CAMERA_PROVIDERS=Object.freeze({digitraffic:{...CAMERA_PROVIDER,center:{lat:65,lon:26}},caltrans:CALTRANS_PROVIDER});
export function cameraProvider(id){return CAMERA_PROVIDERS[String(id).startsWith('caltrans:')?'caltrans':id]||CAMERA_PROVIDERS.digitraffic;}
export function createPublicCameraDirectory(options={}){
 const services={digitraffic:createPublicCameraService(options),caltrans:createCaltransCameraService(options)};
 return {catalogue:({providerId='digitraffic',...rest}={})=>{if(!services[providerId])throw Error('Unknown camera source.');return services[providerId].catalogue(rest);},detail:(id,options)=>services[cameraProvider(id).id].detail(id,options)};
}
export const validCameraReference=id=>typeof id==='string'&&(/^C\d{5}$/.test(id)||/^caltrans:[34]:[\w-]{1,100}:[\w-]{1,100}$/.test(id));
export function normalizeCameraFavorites(value){return Array.isArray(value)?[...new Set(value.filter(validCameraReference))].slice(0,100):[];}
export function cameraJournalReference(item,preset,checkedAt=Date.now()){
 if(!validCameraReference(item?.id)||!preset?.id)throw Error('Choose an available camera view first.');
 const stamp=preset.capturedAt||`checked-${Math.floor(checkedAt/600000)}`;
 return {eventId:`camera:${preset.id}:${stamp}`,eventType:'remote-camera-reference',sourceSystem:'public-camera',sourceId:item.id,pathId:'travel',name:`Remote view: ${item.name}`,detail:`${cameraProvider(item.id).name} still image reference; not an in-person visit. ${preset.capturedAt?'Capture '+preset.capturedAt:'Capture time unavailable.'}`,regionId:'remote-camera',regionLabel:item.country,environment:'EARTH',occurredAt:checkedAt,projections:{journal:true,profile:false,place:false,missionProgress:false},progress:{points:0},metadata:{truthType:'remote-observation',providerId:item.providerId,cameraId:item.id,presetId:preset.id,capturedAt:preset.capturedAt||null,checkedAt}};
}

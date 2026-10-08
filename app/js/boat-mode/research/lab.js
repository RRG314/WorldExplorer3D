import {earthLocalToGeographic} from '../../earth-core/location-origin.js?v=1';
export function researchLabRecord(ctx,now=Date.now()) {
 const geo=earthLocalToGeographic(ctx.LOC,ctx.SCALE,ctx.boat.x,ctx.boat.z);
 if(!Number.isFinite(geo?.lat)||!Number.isFinite(geo?.lon))return null;
 const wave=ctx.activeWaterOpticsEvidence?.wave,reference=ctx.waterEnvironmentStatus?.location;
 const modeled=wave?.truthType==='modeled'&&Number.isFinite(wave.waveHeightM);
 const place=`${geo.lat.toFixed(3)}:${geo.lon.toFixed(3)}`;
 const detail=modeled?`Regional wave model: ${wave.waveHeightM.toFixed(2)} m${Number.isFinite(wave.wavePeriodS)?`, ${wave.wavePeriodS.toFixed(1)} s`:''}. Source: ${wave.sourceId}. Model valid: ${wave.validAt||'time unavailable'}.`:'Regional wave model unavailable. No measured wave height is claimed.';
 return {eventId:`marine-lab:${place}:${Math.floor(now/3600000)}`,eventType:'marine-conditions-reviewed',pathId:'field',sourceSystem:'research-ship',sourceId:`marine-lab:${place}`,activityId:'marine-conditions',name:'Research ship: marine conditions',detail,
  occurredAt:now,locationSnapshot:{...geo,name:'Research vessel'},localPosition:{x:ctx.boat.x,y:ctx.boat.y,z:ctx.boat.z},
  projections:{journal:true,profile:false,place:false,missionProgress:false},progress:{points:0,reason:'conditions-review'},
  metadata:{truthType:modeled?'modeled':'unknown',waveHeightM:modeled?wave.waveHeightM:null,validAt:modeled?wave.validAt:null,sourceId:modeled?wave.sourceId:'none',modelReference:reference?{lat:reference.lat,lon:reference.lon}:null,transportEntityId:String(ctx.boatMode.transportEntityId||'')}};
}

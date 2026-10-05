import {facadeFloorPlan} from './building-facade-layout.js?v=3';

// Original generated architecture. Existing footprint, floor and door authorities
// own placement; these shallow details never create a shop or an entrance.
export function storefrontLayout({length,height,levels,foundation=0,profile,doorAlong=Infinity,doorWidth=1.8}) {
 if (!Number.isFinite(length) || length<3.2 || !(profile?.storefront?.glazing>0) || profile.material?.surfacePattern==='glass') return null;
 const floor=facadeFloorPlan(height,{...profile,levels,foundation});
 if(!floor.floors || floor.floorHeight<2.5)return null;
 const count=Math.max(1,Math.round(length/Math.max(1.8,Number(profile.window?.bayWidth)||3.4)));
 const bayWidth=length/count,windowWidth=bayWidth*profile.storefront.glazing*.94;
 const bottom=foundation+floor.floorHeight*.16,top=foundation+floor.floorHeight*.94;
 const bays=[];
 for(let i=0;i<count && bays.length<24;i++){
  const along=-length/2+(i+.5)*bayWidth;
  const doorwayClearance=Math.max((windowWidth+doorWidth)/2+.2,bayWidth*(Number(profile.window?.width)||.55)/2+1.2);
  if(Math.abs(along-doorAlong)<doorwayClearance)continue;
  bays.push({along,width:windowWidth,bottom,top});
 }
 return {bays,bayWidth,foundation,floorHeight:floor.floorHeight,fasciaY:foundation+floor.floorHeight+.18,awningY:Math.max(foundation+2.35,top+.12)};
}

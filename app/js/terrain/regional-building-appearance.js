import {MATERIAL_VARIANTS,WINDOW_STYLES} from '../world/building-exterior-catalog.js?v=1';
// Versioned, compact construction packet. Visual inference never changes the
// mapped footprint, height, collision, address or claimed building use.
export const REGIONAL_MATERIAL_IDS=Object.freeze(Object.keys(MATERIAL_VARIANTS));
export const REGIONAL_WINDOW_IDS=Object.freeze(Object.keys(WINDOW_STYLES));
export function regionalFacadeStyle(profile,tags={},seed=0){
 const color=String(tags['roof:colour']||tags['roof:color']||'');
 const mapped=/^#[a-f\d]{6}$/i.test(color)?parseInt(color.slice(1),16):/^#[a-f\d]{3}$/i.test(color)?parseInt(color.slice(1).split('').map(c=>c+c).join(''),16):null;
 const tile=/tile|terracotta|clay/.test(tags['roof:material']||'');
 const residential=profile.category==='residential';
 return [Math.max(0,REGIONAL_MATERIAL_IDS.indexOf(profile.materialId)),
  profile.openings===false?-1:Math.max(0,REGIONAL_WINDOW_IDS.indexOf(profile.windowStyle)),
  profile.material.surfacePattern==='glass'?-1:profile.storefront?.glazing||0,
  mapped??(tile?0x80523f:residential?(seed&1?0x626671:0x775c50):0x596163)];
}

import {MUSEUM_CONTENT} from './museum-catalog.js';
import {validateInteriorContent,matchInteriorBuilding} from './content-contract.js';
import {fitGalleryLayout,galleryExhibitPlacements} from './gallery-layout.js';
import {captureBuildingContext} from '../reality-capture/alignment.js?v=1';

// This decorates the existing admitted definition; it never grants access.
// Captures, owned homes and mapped indoor data retain their existing priority.
export function resolveCuratedInterior(ctx,support,definition,records=MUSEUM_CONTENT){
  if(!definition||definition.accessDenied||definition.communityRealityCapture||definition.mode==='mapped')return definition;
  for(const candidate of records){
    try{
      const content=validateInteriorContent(candidate),association=matchInteriorBuilding(content,support,(lat,lon)=>ctx.geoToWorld(lat,lon),ctx.METERS_PER_WORLD_UNIT||1);
      // Other representation kinds have contract names, not an implicit
      // licence to replace their rooms with this representative gallery fit.
      if(content.kind!=='representative')continue;
      if(!association)continue;
      const context=captureBuildingContext(support.building,support.exteriorEntrance||support.entryAnchor);
      if(!context?.entrance)continue;
      const layout=fitGalleryLayout({footprint:context.footprint,holes:context.holes||[],heightMeters:context.wallHeightMeters||context.height?.meters||3.4},context.entrance,content.id,content.layoutProfile);
      if(!layout)continue;
      const placements=galleryExhibitPlacements(layout,content.exhibits,ctx.METERS_PER_WORLD_UNIT||1);if(!placements)continue;
      return {...definition,label:content.title,curatedContent:content,contentAssociation:association,authoredLayout:layout,exhibitPlacements:placements,galleryMetersPerUnit:ctx.METERS_PER_WORLD_UNIT||1};
    }catch(error){console.warn('[Interior] Curated content rejected:',error.message);}
  }
  return definition;
}

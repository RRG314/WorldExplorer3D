import { streetScaleForWorld } from './compiler/street-frontage-policy.js';
// A compact source snapshot. Rendering objects, textures and caches never cross
// the worker boundary. The overview retains the complete loaded source domain.
export function streetSourceInput(appCtx, select=()=>true) {
  const polygons=items=>(items||[]).filter(select).map(item=>({pts:item.surfaceFootprint||item.pts||item.footprint,holes:item.holes,holeRings:item.holeRings,type:item.type,tags:item.tags}));
  return {
    roads:(appCtx.roads||[]).flatMap((road,auditIndex)=>select(road)?[{
      auditIndex,metersPerWorldUnit:road.metersPerWorldUnit,pts:road.pts,width:road.width,type:road.type,tags:road.tags,isStructureConnector:road.isStructureConnector,resolvedCrossSection:road.resolvedCrossSection,
      structureSemantics:road.structureSemantics,transportRecord:{sourceTags:road.transportRecord?.sourceTags,crossSection:road.transportRecord?.crossSection}
    }]:[]),
    buildings:polygons((appCtx.buildings||[]).filter(b=>!b.allowsPassageBelow)),landuses:polygons(appCtx.landuses),
    linearFeatures:(appCtx.linearFeatures||[]).filter(f=>select(f)&&f.kind==='footway'&&['sidewalk','crossing'].includes(f.subtype)&&!f.isStructureConnector).map(f=>({
      kind:f.kind,subtype:f.subtype,width:f.width,pts:f.pts,sourceTags:f.sourceTags,crossingNodes:f.crossingNodes,structureSemantics:f.structureSemantics
    })),metersPerWorldUnit:streetScaleForWorld(appCtx)
  };
}

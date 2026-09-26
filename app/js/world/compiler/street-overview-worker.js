import {prepareStreetPavement,compilePavementTile,pavementTileHasWork} from './street-pavement.js';
import {rasterizePavementMask} from './pavement-mask.js';
let plan=null;
const pending=new Set();
self.onmessage=({data})=>{
 try{
  if(data.type==='prepare'){
   plan=prepareStreetPavement(data.input);plan.sourceCells=plan.tiles.length;
   plan.tiles=plan.tiles.filter(tile=>pavementTileHasWork(tile,false));
   pending.clear();plan.tiles.forEach((_,i)=>pending.add(i));
   self.postMessage({type:'prepared',tiles:plan.tiles.length,keys:plan.tiles.map(tile=>tile.key),sourceCells:plan.sourceCells,excludedCells:plan.sourceCells-plan.tiles.length});
  }else if(data.type==='next'&&plan){
   let selected=-1,distance=Infinity;
   for(const i of pending){const tile=plan.tiles[i],x=(tile.bounds.minX+tile.bounds.maxX)/2,z=(tile.bounds.minZ+tile.bounds.maxZ)/2,d=(x-data.focus.x)**2+(z-data.focus.z)**2;if(d<distance){distance=d;selected=i;}}
   if(selected<0){self.postMessage({type:'complete'});return;}
   const tile=plan.tiles[selected];pending.delete(selected);
   const result=compilePavementTile(tile,plan.metersPerWorldUnit,{includeMarkings:false});
   const resolution=data.resolution||64,mask=rasterizePavementMask(result.polygons,tile.bounds,resolution);
   const coveredSquareWorldUnits=mask.reduce((sum,n)=>sum+n/255,0)*(64/resolution)**2;
   self.postMessage({type:'tile',key:tile.key,bounds:tile.bounds,mask,coveredSquareWorldUnits,remaining:pending.size},[mask.buffer]);
  }
 }catch(error){self.postMessage({type:'error',message:String(error?.message||error)});}
};

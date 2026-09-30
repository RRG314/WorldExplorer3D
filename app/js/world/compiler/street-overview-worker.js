import {prepareStreetPavement,compilePavementTile,pavementTileHasWork} from './street-pavement.js';
import {rasterizePavementMask} from './pavement-mask.js';
let plan=null,stagedInput=null;
const pending=new Set();
self.onmessage=({data})=>{
 try{
  if(data.type==='source-begin'){
   plan=null;pending.clear();stagedInput={roads:[],buildings:[],landuses:[],linearFeatures:[],metersPerWorldUnit:data.metersPerWorldUnit};
   self.postMessage({type:'source-ready'});
  }else if(data.type==='source-chunk'){
   if(!stagedInput||!['roads','buildings','landuses','linearFeatures'].includes(data.field)||!Array.isArray(data.items))throw new Error('Invalid street source chunk');
   for(const item of data.items)stagedInput[data.field].push(item);
   self.postMessage({type:'source-accepted'});
  }else if(data.type==='prepare'){
   const input=data.input||stagedInput;if(!input)throw new Error('Missing street source');
   plan=prepareStreetPavement({...input,sparseOverview:true});stagedInput=null;plan.sourceCells=plan.sourceCellCount;
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
   // This cell will never compile again in this plan. Drop its source/context
   // arrays as soon as its mask exists, rather than retaining every finished cell.
   plan.tiles[selected]=null;
   const coveredSquareWorldUnits=mask.reduce((sum,n)=>sum+n/255,0)*(64/resolution)**2;
   self.postMessage({type:'tile',key:tile.key,bounds:tile.bounds,mask,coveredSquareWorldUnits,remaining:pending.size},[mask.buffer]);
  }
 }catch(error){self.postMessage({type:'error',message:String(error?.message||error)});}
};

/*
MIT License

Copyright (c) 2025 RRG314

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import {buildingCenter,nearestCaptureBuildingIds,createNearestCaptureSelection} from './nearby-buildings.js';

// Browser adaptation of RRG314/rdt-spatial-index's occupancy-driven grid
// partition (packages/rdt-spatial-index/src/index.cjs, MIT). See the provenance
// report. Query results are exact; RDT changes which bounds are visited, never
// the building list or its render/collision authority.
export class RdtBuildingIndex {
  constructor(buildings) {
    this.buildings=buildings;
    this.length=buildings.length;
    this.points=buildings.map(buildingCenter);
    this.identities=buildings.map(b=>b?.sourceBuildingId);
    this.nodes=0;
    const make=(ids,depth)=>{
      let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
      for(const id of ids){const p=this.points[id];minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
      const node={minX,maxX,minZ,maxZ,ids,children:null};this.nodes++;
      if(ids.length<=128 || depth>=12 || (minX===maxX && minZ===maxZ))return node;
      const grid=Math.min(8,Math.max(2,Math.floor(Math.log(ids.length+1)**1.5)));
      const cells=new Map();
      for(const id of ids){const p=this.points[id];
        const x=maxX===minX?0:Math.min(grid-1,Math.floor((p.x-minX)/(maxX-minX)*grid));
        const z=maxZ===minZ?0:Math.min(grid-1,Math.floor((p.z-minZ)/(maxZ-minZ)*grid));
        const key=z*grid+x;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(id);
      }
      if(cells.size<=1)return node;
      node.ids=null;node.children=[...cells.values()].map(ids=>make(ids,depth+1));return node;
    };
    this.root=make(buildings.flatMap((b,i)=>b?.sourceBuildingId?[i]:[]),0);
  }
  matches(buildings) {
    if(this.buildings!==buildings||this.length!==buildings.length)return false;
    // Capture edits and surface publications may mutate the resident list in
    // place. Validate coordinates/identity before using retained spatial bounds.
    for(let i=0;i<buildings.length;i++){
      const b=buildings[i],old=this.points[i];
      if(b?.sourceBuildingId!==this.identities[i])return false;
      if(Number.isFinite(b?.centerX)&&Number.isFinite(b?.centerZ)){
        if(b.centerX!==old.x||b.centerZ!==old.z)return false;
      }else{
        const p=buildingCenter(b);if(p.x!==old.x||p.z!==old.z)return false;
      }
    }
    return true;
  }
  nearest(actor,limit=60) {
    limit=Math.max(0,Math.floor(limit));if(!limit||!this.length)return [];
    if(!Number.isFinite(actor.x)||!Number.isFinite(actor.z))return nearestCaptureBuildingIds(this.buildings,actor,limit);
    if(!this.root.children){
      this.lastCandidates=this.length;
      return nearestCaptureBuildingIds(this.buildings,actor,limit);
    }
    const selection=createNearestCaptureSelection(limit),frontier=[];
    const enqueue=node=>{
      const dx=Math.max(node.minX-actor.x,0,actor.x-node.maxX),dz=Math.max(node.minZ-actor.z,0,actor.z-node.maxZ);
      const distance=Math.hypot(dx,dz);
      if(distance>selection.maximumDistance())return;
      const entry={node,distance};let i=frontier.length;frontier.push(entry);
      while(i>0){const parent=(i-1)>>1;if(frontier[parent].distance<=distance)break;frontier[i]=frontier[parent];i=parent;}
      frontier[i]=entry;
    };
    const takeNearest=()=>{
      const first=frontier[0],last=frontier.pop();
      if(frontier.length){let i=0;
        for(;;){const left=i*2+1,right=left+1;if(left>=frontier.length)break;
          const child=right<frontier.length&&frontier[right].distance<frontier[left].distance?right:left;
          if(frontier[child].distance>=last.distance)break;
          frontier[i]=frontier[child];i=child;
        }
        frontier[i]=last;
      }
      return first;
    };
    // Visit nearest bounds once. A distant flight used to repeatedly expand
    // a radius over the same nodes, then scan the whole city a second time.
    // Equal bounds remain eligible to preserve source-order distance ties.
    this.lastCandidates=0;enqueue(this.root);
    while(frontier.length){
      const {node,distance}=takeNearest();
      if(distance>selection.maximumDistance())break;
      if(node.children){for(const child of node.children)enqueue(child);continue;}
      for(const id of node.ids){const point=this.points[id];this.lastCandidates++;
        selection.consider(String(this.identities[id]),Math.hypot(point.x-actor.x,point.z-actor.z),id);
      }
    }
    return selection.ids();
  }
  dispose(){this.buildings=null;this.points=null;this.identities=null;this.root=null;this.length=0;this.nodes=0;}
}

export function createRdtCaptureSelector(){
  let index=null,sequence=null;
  return {
    select(buildings,actor,worldSequence,limit=60){
      let rebuilt=false;
      if(!index||!index.matches(buildings)||sequence!==worldSequence){
        index?.dispose();index=new RdtBuildingIndex(buildings);sequence=worldSequence;rebuilt=true;
      }
      const ids=index.nearest(actor,limit);
      return {ids,stats:{algorithm:'rdt-spatial',rebuilt,nodes:index.nodes,candidates:index.lastCandidates||0}};
    },
    clear(){index?.dispose();index=null;sequence=null;}
  };
}

import {researchRouteGraph} from './interior-plan.js';
export function createResearchWayfinding(navigation){
 const {nodes,edges}=researchRouteGraph(),byId=new Map(nodes.map(n=>[n.id,n])),links=new Map(nodes.map(n=>[n.id,[]])),fields=new Map();
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
 for(const [a,b] of edges){links.get(a).push(b);links.get(b).push(a);}
 function field(targetId){
  if(fields.has(targetId))return fields.get(targetId);
  const costs=new Map([[targetId,0]]),next=new Map(),pending=new Set([targetId]);
  while(pending.size){const id=[...pending].sort((a,b)=>costs.get(a)-costs.get(b))[0];pending.delete(id);const a=byId.get(id);
   for(const neighbor of links.get(id)){const cost=costs.get(id)+distance(a,byId.get(neighbor));if(cost<(costs.get(neighbor)??Infinity)){costs.set(neighbor,cost);next.set(neighbor,id);pending.add(neighbor);}}
  }
  const result={costs,next};fields.set(targetId,result);return result;
 }
 function route(from,targetId){
  if(!byId.has(targetId))return [];
  const {costs,next}=field(targetId);
  const candidates=nodes.filter(n=>Math.abs(n.y-from.y)<2).sort((a,b)=>distance(a,from)-distance(b,from)).slice(0,8)
   .sort((a,b)=>(distance(a,from)+costs.get(a.id))-(distance(b,from)+costs.get(b.id)));
  const start=candidates.find(n=>navigation.walkableSegment(from,n));if(!start)return [];
  const path=[{...from}];for(let id=start.id;id;id=next.get(id))path.push(byId.get(id));return path;
 }
 return {route};
}

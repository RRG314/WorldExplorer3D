import * as bundle from '../../../vendor/clipper/index.js';
const C = bundle.default || globalThis.ClipperLib;
const SCALE = 1000;
const multi = shape => typeof shape?.[0]?.[0]?.[0] === 'number' ? [shape] : shape;
function paths(shape, origin) {
  const result = [];
  for (const poly of multi(shape) || []) for (let i = 0; i < poly.length; i++) {
    let ring = poly[i].map(([x,z]) => ({ X: Math.round((x-origin[0])*SCALE), Y: Math.round((z-origin[1])*SCALE) }));
    if (!ring.every(p => Number.isSafeInteger(p.X) && Number.isSafeInteger(p.Y))) throw Error('Invalid street polygon coordinate');
    if (ring.length > 1 && ring[0].X === ring.at(-1).X && ring[0].Y === ring.at(-1).Y) ring.pop();
    ring=ring.filter((p,j)=>j===0 || p.X!==ring[j-1].X || p.Y!==ring[j-1].Y);
    if (ring.length < 3 || Math.abs(C.Clipper.Area(ring)) < 1) continue;
    if (C.Clipper.Orientation(ring) !== (i === 0)) ring.reverse();
    result.push(ring);
  }
  return result;
}
// Keep integer clipping near the source geometry. Clipper intersection/offset
// arithmetic includes floating-point steps; large translated coordinates must
// not change narrow frontage polygons. Origins align with the compiler grid.
const originOf = shape => {
  const p = multi(shape)?.[0]?.[0]?.[0] || [0, 0];
  return p.map(n => Math.floor(n / 64) * 64);
};
// Clipper's PolyTree + StrictlySimple path repeatedly repairs containment
// while splitting touching rings. Dense frontage unions can spend seconds in
// that quadratic repair. Split repeated vertices once, then assign holes once.
function polygonResult(solution, origin) {
  const rings=[];
  for(const path of solution){
    const stack=[],indices=new Map();
    for(const point of path.concat(path.length?[path[0]]:[])){
      const key=`${point.X}:${point.Y}`,seen=indices.get(key);
      if(seen!==undefined){
        const ring=stack.slice(seen);
        if(ring.length>=3&&C.Clipper.Area(ring)!==0)rings.push(ring);
        for(let i=seen+1;i<stack.length;i++)indices.delete(`${stack[i].X}:${stack[i].Y}`);
        stack.length=seen+1;
      }else{indices.set(key,stack.length);stack.push(point);}
    }
  }
  const records=rings.map(ring=>{
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const p of ring){minX=Math.min(minX,p.X);maxX=Math.max(maxX,p.X);minY=Math.min(minY,p.Y);maxY=Math.max(maxY,p.Y);}
    return {ring,area:Math.abs(C.Clipper.Area(ring)),minX,maxX,minY,maxY,holes:[],depth:0};
  }).sort((a,b)=>b.area-a.area);
  const index=new Map(),wide=[],outers=[],cellSize=4000;
  for(const item of records){
    const point=item.ring[0],candidates=[...(index.get(`${Math.floor(point.X/cellSize)}:${Math.floor(point.Y/cellSize)}`)||[]),...wide];
    let parent=null;
    for(const candidate of candidates){
      if(candidate.area<=item.area||(parent&&candidate.area>=parent.area)||candidate.minX>item.minX||candidate.maxX<item.maxX||candidate.minY>item.minY||candidate.maxY<item.maxY)continue;
      let inside=true;
      for(let i=0;i<item.ring.length;i++){
        const p=item.ring[i],q=item.ring[(i+1)%item.ring.length];
        const relation=C.Clipper.PointInPolygon(p,candidate.ring);
        if(relation!==-1){inside=relation===1;break;}
        const middle=C.Clipper.PointInPolygon({X:(p.X+q.X)/2,Y:(p.Y+q.Y)/2},candidate.ring);
        if(middle!==-1){inside=middle===1;break;}
      }
      if(inside)parent=candidate;
    }
    item.depth=parent?parent.depth+1:0;
    if(item.depth%2)parent.holes.push(item.ring);else outers.push(item);
    const x0=Math.floor(item.minX/cellSize),x1=Math.floor(item.maxX/cellSize),y0=Math.floor(item.minY/cellSize),y1=Math.floor(item.maxY/cellSize);
    if((x1-x0+1)*(y1-y0+1)>256)wide.push(item);
    else for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=`${x}:${y}`;if(!index.has(key))index.set(key,[]);index.get(key).push(item);}
  }
  return outers.map(outer=>[outer.ring,...outer.holes].map(ring=>{
    const points=ring.map(p=>[p.X/SCALE+origin[0],p.Y/SCALE+origin[1]]);return points.concat([points[0]]);
  }));
}
function execute(type, subject, clips = []) {
  const origin = originOf(subject);
  const engine = new C.Clipper(), solution = [];
  engine.StrictlySimple = true;
  engine.AddPaths(paths(subject, origin), C.PolyType.ptSubject, true);
  for (const item of clips) engine.AddPaths(paths(item, origin), type === C.ClipType.ctUnion ? C.PolyType.ptSubject : C.PolyType.ptClip, true);
  if (!engine.Execute(type, solution, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)) throw Error('Street polygon operation failed');
  return polygonResult(solution,origin);
}
export const streetPolygonKernel = {
  offset: (subject, distance) => {
    const origin = originOf(subject);
    const engine = new C.ClipperOffset(2, .05*SCALE), solution = [];
    engine.AddPaths(paths(subject, origin), C.JoinType.jtMiter, C.EndType.etClosedPolygon);
    engine.Execute(solution, distance*SCALE);
    return polygonResult(solution,origin);
  },
  union: (subject,...rest) => execute(C.ClipType.ctUnion,subject,rest),
  intersection: (subject,other) => execute(C.ClipType.ctIntersection,subject,[other]),
  difference: (subject,other) => execute(C.ClipType.ctDifference,subject,[other])
};

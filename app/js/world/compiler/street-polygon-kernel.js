import * as bundle from '../../../vendor/clipper/index.js';
const C = bundle.default || globalThis.ClipperLib;
const SCALE = 1000;
const multi = shape => typeof shape?.[0]?.[0]?.[0] === 'number' ? [shape] : shape;
function paths(shape) {
  const result = [];
  for (const poly of multi(shape) || []) for (let i = 0; i < poly.length; i++) {
    let ring = poly[i].map(([x,z]) => ({ X: Math.round(x*SCALE), Y: Math.round(z*SCALE) }));
    if (!ring.every(p => Number.isSafeInteger(p.X) && Number.isSafeInteger(p.Y))) throw Error('Invalid street polygon coordinate');
    if (ring.length > 1 && ring[0].X === ring.at(-1).X && ring[0].Y === ring.at(-1).Y) ring.pop();
    ring=ring.filter((p,j)=>j===0 || p.X!==ring[j-1].X || p.Y!==ring[j-1].Y);
    if (ring.length < 3 || Math.abs(C.Clipper.Area(ring)) < 1) continue;
    if (C.Clipper.Orientation(ring) !== (i === 0)) ring.reverse();
    result.push(ring);
  }
  return result;
}
function execute(type, subject, clips = []) {
  const engine = new C.Clipper(), tree = new C.PolyTree();
  engine.StrictlySimple = true;
  engine.AddPaths(paths(subject), C.PolyType.ptSubject, true);
  for (const item of clips) engine.AddPaths(paths(item), type === C.ClipType.ctUnion ? C.PolyType.ptSubject : C.PolyType.ptClip, true);
  if (!engine.Execute(type, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)) throw Error('Street polygon operation failed');
  return C.JS.PolyTreeToExPolygons(tree).map(poly => [poly.outer, ...poly.holes].map(ring => {
    const pts = ring.map(p => [p.X/SCALE,p.Y/SCALE]); return pts.concat([pts[0]]);
  }));
}
export const streetPolygonKernel = {
  union: (subject,...rest) => execute(C.ClipType.ctUnion,subject,rest),
  intersection: (subject,other) => execute(C.ClipType.ctIntersection,subject,[other]),
  difference: (subject,other) => execute(C.ClipType.ctDifference,subject,[other])
};

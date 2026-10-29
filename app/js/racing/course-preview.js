// Shared presentation only. Routes and admission remain owned by the course
// rules and world session; a map cannot make an unbuilt venue playable.
export function raceCourseDisplayName(course) {
 const prefix=course.locationLabel?`${course.locationLabel} · `:'';
 return prefix&&course.name.startsWith(prefix)?course.name.slice(prefix.length):course.name;
}
export function raceDisciplineLabel(discipline) {
 return ({sprint:'Sprint',circuit:'Circuit','time-trial':'Time trial'})[discipline]||'Road race';
}
export function createRaceRouteMap({roads=[],course,locationLabel='',creatorSegments=[],creatorPoints=[],onPoint}={}) {
 const points=roads.flatMap(road=>[road.a,road.b]);
 if(!points.length)return null;
 // Leave space for the full start/finish labels at the edge of a route.
 const padding=48,minX=Math.min(...points.map(p=>p.x))-padding,minZ=Math.min(...points.map(p=>p.z))-padding,
  width=Math.max(...points.map(p=>p.x))-minX+padding,height=Math.max(...points.map(p=>p.z))-minZ+padding;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox',`${minX} ${minZ} ${width} ${height}`);svg.setAttribute('role','img');
 svg.setAttribute('aria-label',`${locationLabel} roads${course?` · ${raceCourseDisplayName(course)}`:''}. Start and finish are marked.`);
 const path=(pts,color,lineWidth)=>{const poly=document.createElementNS(ns,'polyline');poly.setAttribute('points',pts.map(p=>`${p.x},${p.z}`).join(' '));poly.setAttribute('fill','none');poly.setAttribute('stroke',color);poly.setAttribute('stroke-width',lineWidth);poly.setAttribute('stroke-linecap','round');poly.setAttribute('stroke-linejoin','round');svg.append(poly);};
 const dot=(point,fill,r=4)=>{const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',point.x);circle.setAttribute('cy',point.z);circle.setAttribute('r',r);circle.setAttribute('fill',fill);svg.append(circle);};
 for(const road of roads)path([road.a,road.b],'#3f5150',2);
 if(course){
  path(course.points,'#eec96b',4);
  const first=course.points[0],last=course.points.at(-1),closed=Math.hypot(first.x-last.x,first.z-last.z)<.01;
  const markers=closed?[[first,'S / F','#f5f6ed']]:[[last,'F','#eec96b'],[first,'S','#f5f6ed']];
  for(const [point,label,fill]of markers){
   dot(point,fill,7);const text=document.createElementNS(ns,'text');text.setAttribute('x',point.x+10);text.setAttribute('y',point.z-10);text.setAttribute('fill',fill);text.setAttribute('font-size','14');text.setAttribute('font-weight','700');text.textContent=label;svg.append(text);
  }
 }
 for(const segment of creatorSegments)path(segment,'#aacde8',3);
 creatorPoints.forEach((point,i)=>dot(point,i?'#aacde8':'#fff',5));
 if(onPoint)svg.addEventListener('click',event=>{const matrix=svg.getScreenCTM();if(!matrix)return;const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;onPoint(p.matrixTransform(matrix.inverse()));});
 return svg;
}

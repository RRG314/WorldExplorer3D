// Shared presentation only. Routes and admission remain owned by the course
// rules and world session; a map cannot make an unbuilt venue playable.
export function raceCourseDisplayName(course) {
 const prefix=course.locationLabel?`${course.locationLabel} · `:'';
 return prefix&&course.name.startsWith(prefix)?course.name.slice(prefix.length):course.name;
}
export function raceDisciplineLabel(discipline) {
 return ({sprint:'Sprint',circuit:'Circuit','time-trial':'Time trial',oval:'Oval',rally:'Rally stage'})[discipline]||'Road race';
}
export function createRaceRouteMap({roads=[],buildings=[],course,locationLabel='',creatorSegments=[],creatorPoints=[],player,onPoint}={}) {
 const points=[...roads.flatMap(r=>[r.a,r.b]),...creatorPoints,...(course?.points||[])];if(!points.length)points.push({x:(player?.x||0)-150,z:(player?.z||0)-150},{x:(player?.x||0)+150,z:(player?.z||0)+150});
 const padding=48,minX=Math.min(...points.map(p=>p.x))-padding,minZ=Math.min(...points.map(p=>p.z))-padding,width=Math.max(...points.map(p=>p.x))-minX+padding,height=Math.max(...points.map(p=>p.z))-minZ+padding;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');let view={x:minX,z:minZ,w:width,h:height};
 const applyView=()=>svg.setAttribute('viewBox',`${view.x} ${view.z} ${view.w} ${view.h}`);applyView();svg.setAttribute('role','img');svg.setAttribute('tabindex','0');svg.style.touchAction='none';
 svg.setAttribute('aria-label',`${locationLabel} overhead track map. Roads, buildings, start and finish are marked. Arrow keys pan, plus and minus zoom, Enter adds the centre.`);
 const path=(pts,color,lineWidth)=>{const p=document.createElementNS(ns,'polyline');p.setAttribute('points',pts.map(p=>`${p.x},${p.z}`).join(' '));p.setAttribute('fill','none');p.setAttribute('stroke',color);p.setAttribute('stroke-width',lineWidth);p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');p.setAttribute('vector-effect','non-scaling-stroke');svg.append(p);};
 const dot=(p,color,r=4)=>{const c=document.createElementNS(ns,'circle');c.setAttribute('cx',p.x);c.setAttribute('cy',p.z);c.setAttribute('r',r);c.setAttribute('fill',color);svg.append(c);};
 const text=(p,value,color,size=12)=>{const t=document.createElementNS(ns,'text');t.setAttribute('x',p.x+8);t.setAttribute('y',p.z-8);t.setAttribute('fill',color);t.setAttribute('font-size',size);t.setAttribute('paint-order','stroke');t.setAttribute('stroke','#102725');t.setAttribute('stroke-width','2');t.textContent=value;svg.append(t);};
 for(const b of buildings||[]){if(!b.pts?.length||b.maxX<minX||b.minX>minX+width||b.maxZ<minZ||b.minZ>minZ+height)continue;const p=document.createElementNS(ns,'polygon');p.setAttribute('points',b.pts.map(p=>`${p.x},${p.z}`).join(' '));p.setAttribute('fill','#314341');p.setAttribute('stroke','#61736d');p.setAttribute('stroke-width','.5');svg.append(p);}
 const labels=new Set();for(const road of roads){path([road.a,road.b],'#718780',3);if(road.label&&!labels.has(road.label)&&labels.size<18){labels.add(road.label);text({x:(road.a.x+road.b.x)/2,z:(road.a.z+road.b.z)/2},road.label,'#abbfb6',10);}}
 if(course){path(course.points,'#102725',11);path(course.points,'#f0c75d',6);const first=course.points[0],last=course.points.at(-1),closed=Math.hypot(first.x-last.x,first.z-last.z)<.01;
  for(const [p,label,color]of closed?[[first,'START / FINISH','#fff']]:[[last,'FINISH','#f0c75d'],[first,'START','#fff']]){dot(p,color,6);text(p,label,color,14);}}
 for(const segment of creatorSegments)path(segment,'#8bd7ef',4);creatorPoints.forEach((p,i)=>{dot(p,i?'#8bd7ef':'#fff',5);text(p,String(i+1),'#fff');});if(player){dot(player,'#e6a58f',4);text(player,'You','#e6a58f');}
 svg.zoomBy=factor=>{const w=Math.max(40,Math.min(4000,view.w*factor)),h=w*view.h/view.w;view={x:view.x+(view.w-w)/2,z:view.z+(view.h-h)/2,w,h};applyView();};
 svg.addEventListener('keydown',e=>{const step=view.w*.12;if(e.key==='ArrowLeft')view.x-=step;else if(e.key==='ArrowRight')view.x+=step;else if(e.key==='ArrowUp')view.z-=step;else if(e.key==='ArrowDown')view.z+=step;else if(['+','='].includes(e.key))svg.zoomBy(.7);else if(e.key==='-')svg.zoomBy(1.4);else if(e.key==='Enter')onPoint?.({x:view.x+view.w/2,y:view.z+view.h/2});else return;e.preventDefault();e.stopPropagation();applyView();});
 let drag=null,moved=false;svg.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,view:{...view}};moved=false;svg.setPointerCapture(e.pointerId);});
 svg.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dz=e.clientY-drag.y;if(Math.hypot(dx,dz)>6)moved=true;if(moved){const rect=svg.getBoundingClientRect(),scale=Math.max(drag.view.w/rect.width,drag.view.h/rect.height);view={...drag.view,x:drag.view.x-dx*scale,z:drag.view.z-dz*scale};applyView();}});
 svg.addEventListener('pointerup',()=>{drag=null;});svg.addEventListener('pointercancel',()=>{drag=null;moved=true;});
 if(onPoint)svg.addEventListener('click',event=>{if(moved){moved=false;return;}const matrix=svg.getScreenCTM();if(!matrix)return;const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;onPoint(p.matrixTransform(matrix.inverse()));});return svg;
}

// Read-only geographic context, using the same OSM raster source as the minimap.
// No road inference, world mutation, continuous render loop or background fetches.
export function mountCaptureMap(host,building,points,onWall,signal){
  const lat=Number(building?.lat),lon=Number(building?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85){host.textContent='Map context unavailable here. Use the footprint and compass directions.';return {select(){}};}
  const zoom=19,n=2**zoom,px=(lon+180)/360*n*256;
  const py=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n*256;
  const meter=256*n/(2*Math.PI*6378137*Math.cos(lat*Math.PI/180));
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 512 512');svg.style.cssText='width:100%;height:auto;display:block;background:#18242d';
  svg.setAttribute('aria-label','North-up map with the selected building outline and numbered walls');
  const x0=px-256,y0=py-256;let loaded=0,failed=0;
  const status=document.createElement('p');status.textContent='Loading surrounding streets…';
  for(let y=Math.floor(y0/256);y<=Math.floor((y0+512)/256);y++)for(let x=Math.floor(x0/256);x<=Math.floor((x0+512)/256);x++){
    const img=document.createElementNS(ns,'image');img.setAttribute('x',x*256-x0);img.setAttribute('y',y*256-y0);img.setAttribute('width','256');img.setAttribute('height','256');
    img.addEventListener('load',()=>{loaded++;status.textContent=failed?'Some map tiles are unavailable; the outline is still selectable.':'North ↑ · map context, not a verified front-door designation.';},{signal});
    img.addEventListener('error',()=>{failed++;status.textContent=loaded?'Some map tiles are unavailable.':'Map tiles could not load. The saved footprint remains available.';},{signal});
    img.setAttribute('href',`https://tile.openstreetmap.org/${zoom}/${((x%n)+n)%n}/${y}.png`);svg.append(img);
  }
  const lines=[];
  points.forEach((p,i)=>{const q=points[(i+1)%points.length],line=document.createElementNS(ns,'line');
    for(const [k,v]of Object.entries({x1:256+p.x*meter,y1:256+p.z*meter,x2:256+q.x*meter,y2:256+q.z*meter,stroke:'#1675db','stroke-width':8,tabindex:0,role:'button','aria-label':`Select wall ${i+1}`}))line.setAttribute(k,v);
    line.style.cursor='pointer';line.addEventListener('click',()=>onWall(i),{signal});line.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onWall(i);}},{signal});svg.append(line);lines.push(line);
    const label=document.createElementNS(ns,'text');label.setAttribute('x',256+(p.x+q.x)*meter/2);label.setAttribute('y',250+(p.z+q.z)*meter/2);label.setAttribute('fill','#000');label.setAttribute('stroke','#fff');label.setAttribute('stroke-width','3');label.setAttribute('paint-order','stroke');label.style.cssText='font:bold 20px system-ui;pointer-events:none';label.textContent=String(i+1);svg.append(label);
  });
  const attribution=document.createElement('a');attribution.href='https://www.openstreetmap.org/copyright';attribution.target='_blank';attribution.rel='noopener noreferrer';attribution.textContent='© OpenStreetMap contributors';
  host.replaceChildren(svg,status,attribution);
  signal.addEventListener('abort',()=>{svg.querySelectorAll('image').forEach(i=>i.removeAttribute('href'));host.replaceChildren();},{once:true});
  return {select(wall){lines.forEach((l,i)=>l.setAttribute('stroke',i===wall?'#e39800':'#1675db'));}};
}

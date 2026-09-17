import {fromFile} from 'geotiff';
import fs from 'node:fs/promises';
const base=process.argv[2];
if(!base)throw new Error('EA source data directory required');
const coords=JSON.parse(await fs.readFile(`${base}/coordinates.json`));
const rows=coords.samples.map(s=>({...s,sum:0,sumSquared:0,valid:0,total:0,sourceTiles:[]}));
const inside=(x,y,p)=>p.every((a,i)=>{const b=p[(i+1)%p.length];return (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])>=-1e-6;});
const metadata=[];
for(const filename of (await fs.readdir(base)).filter(n=>n.endsWith('.tif'))){
 const file=await fromFile(`${base}/${filename}`);
 try {
  const image=await file.getImage();const [ox,oy]=image.getOrigin();const [dx,dy]=image.getResolution();const width=image.getWidth(),height=image.getHeight(),nodata=image.getGDALNoData();
  const data=await image.readRasters({interleave:true});
  metadata.push({filename,width,height,origin:[ox,oy],resolution:[dx,dy],nodata,geoKeys:image.getGeoKeys()});
  if(image.getGeoKeys().ProjectedCSTypeGeoKey!==27700||dx!==2||dy!==-2||data.length!==width*height)throw Error('Unexpected raster layout');
  for(const row of rows){
   const xs=row.polygon.map(p=>(p[0]-ox)/dx),ys=row.polygon.map(p=>(p[1]-oy)/dy);
   const left=Math.max(0,Math.floor(Math.min(...xs))),right=Math.min(width-1,Math.ceil(Math.max(...xs)));
   const top=Math.max(0,Math.floor(Math.min(...ys))),bottom=Math.min(height-1,Math.ceil(Math.max(...ys)));
   if(left>right||top>bottom)continue;
   row.sourceTiles.push(filename);
   for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
    if(!inside(ox+(x+.5)*dx,oy+(y+.5)*dy,row.polygon))continue;
    row.total++;const v=data[y*width+x];
    if(Number.isFinite(v)&&v!==nodata){row.valid++;row.sum+=v;row.sumSquared+=v*v;}
   }
   const px=Math.floor((row.easting-ox)/dx),py=Math.floor((row.northing-oy)/dy);
   if(px>=0&&px<width&&py>=0&&py<height){const v=data[py*width+px];if(v!==nodata&&Number.isFinite(v))row.pointOdn=v;}
  }
 }finally{await file.close();}
 console.log('sampled',filename);
}
const samples=rows.map(({sum,sumSquared,...r})=>({...r,meanOdn:r.valid?sum/r.valid:null,stdDev:r.valid?Math.sqrt(Math.max(0,sumSquared/r.valid-(sum/r.valid)**2)):null,meanEgm:r.valid?sum/r.valid-r.egmToOdnOffset:null}));
await fs.writeFile(`${base}/samples.json`,JSON.stringify({transform:coords.transform,metadata,samples},null,2)+'\n');
const changes=samples.filter(s=>s.meanEgm!==null).map(s=>s.meanEgm-s.oldGround).sort((a,b)=>a-b);
console.log(JSON.stringify({samples:samples.length,missing:samples.filter(s=>!s.valid).length,partial:samples.filter(s=>s.valid!==s.total).length,minCoverage:Math.min(...samples.map(s=>s.valid/s.total)),deltaMin:changes[0],deltaMedian:changes[Math.floor(changes.length/2)],deltaMax:changes.at(-1)}));

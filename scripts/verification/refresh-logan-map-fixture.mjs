import {writeFile,readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {getAdaptiveLoadProfile} from '../../app/js/world/budgets.js';
import {buildWorldOverpassPlan} from '../../app/js/world/osm-loader.js';
// Read-only public requests, serial. Never relabel old response bytes as a new query.
for(const profile of ['desktop','mobile']){
 const prefix=`tests/fixtures/multiplayer/logan-primary-${profile}`,old=JSON.parse(await readFile(`${prefix}.meta.json`));
 const budget=getAdaptiveLoadProfile(0,'low',profile==='mobile'?.28:1,profile);
 const plan=buildWorldOverpassPlan({location:old.location,roadsRadius:budget.radii[0],...budget,buildingVisibleRadiusWorld:2700,loadStartedAt:0});
 const query=plan.primaryQuery.replace(/\[timeout:\d+\]/,'[timeout:30]');
 const endpoint=process.env.WE3D_FIXTURE_ENDPOINT || old.endpoint;
 const response=await fetch(process.env.WE3D_FIXTURE_GET ? `${endpoint}?${new URLSearchParams({data:query})}` : endpoint, process.env.WE3D_FIXTURE_GET ? {signal:AbortSignal.timeout(45000)} : {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'},body:'data='+encodeURIComponent(query),signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error(`${profile}: provider ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer()),data=JSON.parse(bytes);
 if(data.remark||!data.elements?.some(e=>e.tags?.highway))throw Error(`${profile}: incomplete response`);
 const meta={...old,endpoint,query,recordedAt:new Date().toISOString(),sourceTimestamp:data.osm3s?.timestamp_osm_base,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,elements:data.elements.length};
 await writeFile(`${prefix}.json.gz`,gzipSync(bytes));await writeFile(`${prefix}.meta.json`,JSON.stringify(meta,null,2)+'\n');
 console.log(JSON.stringify({profile,bytes:meta.bytes,elements:meta.elements,sourceTimestamp:meta.sourceTimestamp}));
}

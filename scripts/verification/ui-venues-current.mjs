import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
const base=process.env.WE3D_VERIFY_BASE_URL||'http://127.0.0.1:4192',output=path.resolve(`output/verification/trail-ui-20261104/venues-${Date.now()}`);
const report={scope:'Original museum/aquarium native panels, catalogs and layout compilers with controlled visitor state. No physical entry, animal/model load, collection save or mission replay.',cases:[]};let qa;
try{
 qa=await createFieldworkQaSession({rootDir:process.cwd(),output,careerId:'explorer',maximumDurationMs:4*60*1000});const{page}=qa;
 for(const kind of ['museum-map','museum-label','aquarium-map','aquarium-label']){
  if(process.env.WE3D_UI_CASES&&!process.env.WE3D_UI_CASES.split(',').includes(kind))continue;
  await page.goto(base+'/tests/fixtures/ui-client.html');await page.evaluate(async kind=>{
   await document.fonts.load('16px "World Explorer Trail"');const ctx={Walk:{state:{walker:{x:0,z:0}}},setPauseReason(){}};
   if(kind.startsWith('museum')){
    const{MUSEUM_CONTENT}=await import('/app/js/interiors/museum-catalog.js');const{fitGalleryLayout,galleryExhibitPlacements}=await import('/app/js/interiors/gallery-layout.js');
    const content=MUSEUM_CONTENT[0],layout=fitGalleryLayout({footprint:[{x:-10,z:-12},{x:10,z:-12},{x:10,z:12},{x:-10,z:12}],heightMeters:5,revision:'ui-fixture'},{x:0,z:-12},content.id,content.layoutProfile);
    const active={center:{x:0,z:0},definition:{curatedContent:content,authoredLayout:layout,exhibitPlacements:galleryExhibitPlacements(layout,content.exhibits)},gallery:{isCurrent:()=>true,saved:new Set(),exhibits:new Map(content.exhibits.map(exhibit=>[exhibit.id,{exhibit,status:'unavailable'}]))}};
    const{openGalleryPanel}=await import('/app/js/interiors/gallery-ui.js');openGalleryPanel(ctx,active,kind.endsWith('label')?content.exhibits[0].id:null);
   }else{
    const{AQUARIUM_CONTENT}=await import('/app/js/interiors/aquarium-content.js');const{createAquariumLayout}=await import('/app/js/interiors/aquarium-layout.js');
    const{earthCoordinateFrame}=await import('/app/js/earth-core/coordinate-frame.js');const frame=earthCoordinateFrame({lat:39.28551,lon:-76.6086},100000);const plan=createAquariumLayout((lat,lon)=>frame.toWorld(lat,lon),1.11);
    const active={center:{x:0,z:0},activeLevel:0,floorBaseY:0,floorLabel:'G · Glass Pavilion',floorPlan:plan.layout,authoredLifts:plan.layout.lifts,definition:{aquariumContent:AQUARIUM_CONTENT,aquariumPlan:plan,authoredLayout:plan.layout},aquarium:{isCurrent:()=>true,saved:new Set()}};
    const{openAquariumPanel}=await import('/app/js/interiors/aquarium-ui.js');openAquariumPanel(ctx,active,kind.endsWith('label')?AQUARIUM_CONTENT.observations[0].id:null);
   }
  },kind);
  const root=page.locator('.galleryDialog');await root.waitFor({state:'visible'});const views=[];
  for(const[width,height,scale]of [[1440,960,'100'],[390,844,'100'],[844,390,'100'],[390,844,'200']]){
   report.failureCase={kind,width,height,scale};await page.setViewportSize({width,height});await page.evaluate(scale=>document.documentElement.dataset.we3dTextScale=scale,scale);
   assert.ok(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+1),kind+' reflows');await root.locator('header button').click({trial:true});
   const image=kind+'-'+width+'-'+scale+'.png';await page.screenshot({path:path.join(output,image)});views.push({width,height,scale,image});
  }
  await page.keyboard.press('Escape');assert.equal(await root.count(),0);report.cases.push({kind,views,ok:true});delete report.failureCase;console.log(kind);
 }
 assert.deepEqual(qa.report.errors,[]);report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;await qa?.fail(error);}
finally{await qa?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,output,cases:report.cases.map(c=>c.kind),failure:report.failure}));if(!report.ok)process.exitCode=1;

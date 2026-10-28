import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import * as parse5 from 'parse5';
import {pathToFileURL} from 'node:url';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {vendorScriptsCritical} from '../../app/js/modules/manifest.js';

export async function verifyHudWeatherLayout(){
  const out=process.env.WE3D_VERIFY_OUTPUT_DIR||'output/verification/hud-weather-layout';await mkdir(out,{recursive:true});
  const wanted=['hud','mainMenuBtn','floatMenuContainer','mobileTouchControls','liveGpsHud','deFlockHud','urbanCivicStatus'];
  const source=parse5.parse(await readFile('app/index.html','utf8')),nodes={};
  function visit(n){const id=n.attrs?.find(a=>a.name==='id')?.value;if(wanted.includes(id))nodes[id]=n;if(n.tagName==='head')nodes.head=n;for(const child of n.childNodes||[])visit(child);}
  visit(source);for(const id of wanted)assert.ok(nodes[id],`Current product ${id} must exist`);
  nodes.head.childNodes=nodes.head.childNodes.filter(n=>n.tagName!=='script');
  const html='<!doctype html><html><head><base href="/app/">'+parse5.serialize(nodes.head)+'</head><body>'+wanted.filter(id=>{let parent=nodes[id].parentNode;while(parent){if(wanted.includes(parent.attrs?.find(a=>a.name==='id')?.value))return false;parent=parent.parentNode;}return true;}).map(id=>parse5.serializeOuter(nodes[id])).join('')+`<script src="${vendorScriptsCritical[0]}"></script><script type="module">
    import {ctx} from '/app/js/shared-context.js?v=55';
    import {updateHUD} from '/app/js/hud.js';
    import {updateOceanHud} from '/app/js/ocean/hud.js';
    import {setupSettingsUi} from '/app/js/ui/settings.js?v=2';
    import {bindWorldFocusControls} from '/app/js/ui/world-focus.js';
    import {getScreenLayoutService} from '/app/js/ui/screen-layout.js?v=3';
    import {showWorldSelectionNotice} from '/app/js/interaction/world-click-router.js?v=4';
    window.showWorldSelectionNotice=showWorldSelectionNotice;
    Object.assign(ctx,{apiConfig:{},selLoc:'custom',customLoc:{name:'Baltimore, Maryland'},LOC:{lat:39.2904,lon:-76.6122},SCALE:100000,METERS_PER_WORLD_UNIT:1,keys:{},
      Walk:{state:{mode:'walk',walker:{x:0,z:0,angle:0,speedMph:2}}},car:{speed:0,x:0,z:0,angle:0,condition:1},playerConditionAuthority:{snapshot:()=>({condition:1})}});
    setupSettingsUi(ctx);
    const canvas=document.createElement('canvas');canvas.id='worldCanvas';canvas.tabIndex=0;canvas.style.cssText='position:fixed;inset:0;width:100vw;height:100dvh';document.body.prepend(canvas);
    ctx.gameStarted=true;ctx.renderer={domElement:canvas};
    const focusReturn=bindWorldFocusControls(ctx,()=>{});window.focusReturn=focusReturn;
    for(const id of ['hud','coords','minimap','minimapZoomControls','worldQuickControls','floatMenuContainer','mainMenuBtn'])document.getElementById(id).classList.add('show');
    document.getElementById('mobileTouchControls').classList.add('show','mode-walking');
    window.hudProbe={ctx,updateHUD,updateOceanHud};updateHUD();
    window.hudLayout=getScreenLayoutService();hudLayout.bindHudLayout();
    window.render_game_to_text=()=>JSON.stringify({scope:'Controlled current HUD component, no world',speed:document.getElementById('speed').textContent,condition:document.getElementById('conditionLabel').textContent,collapsed:document.getElementById('hudBox').classList.contains('compact')});
    window.ready=true;
  </script></body></html>`;
  const server=await startStaticServer({rootDir:process.cwd(),ports:[0],handleRequest:async(q,r,u)=>{if(u.pathname!=='/__hud-layout')return false;r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);return true;}});
  let owned,page;
  const report={passed:false,scope:'Current product HUD, adjacent map/navigation/touch markup, current settings handler and Earth/Ocean HUD readers with controlled actor/weather values. No rendered city, physical touch/sensor, first-playable or whole-product acceptance.',cases:[],errors:[]};
  try{
    owned=await chromium.launchServer({channel:'chrome',headless:true});const browser=await chromium.connect(owned.wsEndpoint());
    page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.port}/__hud-layout`);await page.waitForFunction(()=>window.ready===true);await page.evaluate(()=>document.fonts.ready);
    report.reader=await page.evaluate(async()=>{
      const {ctx,updateHUD,updateOceanHud}=hudProbe,flush=()=>new Promise(resolve=>setTimeout(resolve,0));
      let mutations=0;const observer=new MutationObserver(rows=>mutations+=rows.length);observer.observe(document.getElementById('hud'),{attributes:true,childList:true,characterData:true,subtree:true});
      for(let i=0;i<40;i++)updateHUD();await flush();const unchanged=mutations;
      ctx.Walk.state.walker.speedMph=4;ctx.playerConditionAuthority.snapshot=()=>({condition:.4});updateHUD();await flush();
      const text=id=>document.getElementById(id).textContent,changed={speed:text('speed'),condition:text('conditionLabel'),value:document.getElementById('conditionBar').getAttribute('aria-valuenow')};
      ctx.Walk.state.mode='drive';ctx.car.road={name:'Pratt Street',limit:30};updateHUD();await flush();const drive={street:text('street'),limit:text('limit')};
      mutations=0;for(let i=0;i<20;i++)updateHUD();await flush();const unchangedDrive=mutations;
      const mode={launchSite:{lat:39.29,lon:-76.61,name:'Harbor',region:'Maryland'},submarine:{position:{x:0,y:-100,z:0},speed:2},condition:.7};
      updateOceanHud(ctx,mode);await flush();const submarine=text('conditionLabel');
      mode.diver={active:true,navigationActor:()=>({position:{x:0,y:-5,z:0},speed:1}),snapshot:()=>({swimming:{airSeconds:45,airCapacity:180}})};
      updateOceanHud(ctx,mode);await flush();const dive=text('conditionLabel');observer.disconnect();return {unchanged,unchangedDrive,changed,drive,submarine,dive};
    });
    assert.equal(report.reader.unchanged,0);assert.equal(report.reader.unchangedDrive,0);
    assert.deepEqual(report.reader.changed,{speed:'4',condition:'Explorer health · 40%',value:'40'});assert.deepEqual(report.reader.drive,{street:'Pratt Street',limit:'30'});
    assert.equal(report.reader.submarine,'Submarine health · 70%');assert.equal(report.reader.dive,'Dive air · 25%');
    const cases=[
      {name:'desktop-short-window',width:1280,height:450,scale:'100',weather:['☀️ Clear · 57°F','77% humidity · Wind 4 mph NE'],readableMap:true},
      {name:'desktop-weather',width:1440,height:900,scale:'100',weather:['🌧 Heavy rain · 69°F','46% humidity · Wind 10 mph NW']},
      {name:'desktop-unavailable',width:1024,height:768,scale:'200',weather:['Weather unavailable','No current model coverage']},
      {name:'phone',width:390,height:844,scale:'100'},
      {name:'narrow-phone-large-text',width:320,height:740,scale:'200'},
      {name:'landscape',width:844,height:390,scale:'100'},
      {name:'landscape-large-text',width:844,height:390,scale:'200'},
      {name:'gps-phone',width:390,height:844,scale:'100',status:['liveGpsHud']},
      {name:'gps-phone-large',width:320,height:740,scale:'200',status:['liveGpsHud']},
      {name:'gps-deflock-landscape',width:844,height:390,scale:'100',status:['liveGpsHud','deFlockHud']},
      {name:'civic-desktop',width:1440,height:900,scale:'100',status:['urbanCivicStatus']},
      {name:'selection-phone',width:390,height:844,scale:'100',selection:true},
      {name:'gps-plane-phone',width:390,height:844,scale:'100',mode:'plane',status:['liveGpsHud']},
      {name:'gps-car-southpaw-landscape',width:844,height:390,scale:'100',mode:'driving',southpaw:true,tilt:true,status:['liveGpsHud']}
    ].filter(row=>!process.env.WE3D_HUD_CASE||process.env.WE3D_HUD_CASE.split(',').includes(row.name));
    const cdp=await page.context().newCDPSession(page);
    for(const row of cases){
      await page.setViewportSize({width:row.width,height:row.height});
      await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:!row.name.startsWith('desktop')&&row.width<1100});
      await page.evaluate(row=>{
        document.documentElement.dataset.we3dTextScale=row.scale;
        const id=n=>document.getElementById(n);id('hudBox').classList.remove('compact');
        for(const name of ['hudBox','hudMap','hudUtilities'])id(name).scrollTop=0;
        id('speed').textContent='12';id('speedUnitLabel').textContent='KTS';id('limitLabel').textContent='SIM DEPTH';id('limit').textContent='1000m';
        id('street').textContent='Ocean · Scuba explorer';id('conditionLabel').textContent='Dive air · 25%';
        id('weatherPanel').style.display='block';id('weatherLine').textContent=row.weather?.[0]||'Loading live weather';id('weatherMetaLine').textContent=row.weather?.[1]||'Fetching local conditions';
        id('mobileTouchControls').classList.toggle('show',!row.name.startsWith('desktop')&&row.width<1100);
        const touch=id('mobileTouchControls');touch.classList.remove('mode-walking','mode-driving','mode-plane');touch.classList.add('mode-'+(row.mode||'walking'));touch.dataset.handedness=row.southpaw?'southpaw':'standard';id('mobileDrivePedals').hidden=row.mode!=='driving';id('mobileTiltQuickRecenter').classList.toggle('hidden',!row.tilt);
        for(const name of ['liveGpsHud','deFlockHud','urbanCivicStatus'])id(name).classList.toggle('show',!!row.status?.includes(name));
        if(row.selection)showWorldSelectionNotice('Mapped waterfront building','Inspect the mapped identity before choosing an activity.',{label:'Inspect place',onClick:()=>window.selectedWorldAction=(window.selectedWorldAction||0)+1});else{const card=id('worldSelectionNotice');if(card)card.hidden=true;}
        document.body.classList.toggle('live-gps-active',!!row.status?.includes('liveGpsHud'));document.body.classList.toggle('deflock-active',!!row.status?.includes('deFlockHud'));
      },row);
      await page.evaluate(()=>{hudLayout.refreshHudLayout();return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
      // Viewport emulation, text reflow and ResizeObserver delivery can span
      // different frames. Observe the settled result without driving the view.
      await page.waitForFunction(()=>{
        if(!matchMedia('(pointer:coarse)').matches)return true;
        const r=id=>document.getElementById(id).getBoundingClientRect();
        const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
        return ['hudMap','hudUtilities'].every(id=>['mobileMovePad','mobileLookPad'].every(pad=>!overlaps(r(id),r(pad))));
      },null,{timeout:1500});
      const result=await page.evaluate(()=>{
        const box=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        const hud=document.getElementById('hudBox'),bounds=box(hud),toggle=box(document.getElementById('hudToggleBtn')),clipped=[];
        for(const id of ['speed','speedUnitLabel','limitLabel','limit','conditionLabel','street']){const el=document.getElementById(id),rect=box(el);if(el.scrollWidth>el.clientWidth+1)clipped.push(id);if(rect.x<bounds.x||rect.right>bounds.right+1)clipped.push(id+' bounds');}
        return {bounds,toggle,clipped,horizontalOverflow:hud.scrollWidth>hud.clientWidth+1,conditionFont:parseFloat(getComputedStyle(document.getElementById('conditionLabel')).fontSize),weather:getComputedStyle(document.getElementById('weatherPanel')).display,coarse:matchMedia('(pointer:coarse)').matches,textScale:getComputedStyle(document.documentElement).getPropertyValue('--wx-text-scale').trim(),map:box(document.getElementById('hudMap')),quickControls:box(document.getElementById('hudUtilities')),menu:box(document.getElementById('mainMenuBtn')),move:box(document.getElementById('mobileMovePad')),look:box(document.getElementById('mobileLookPad'))};
      });
      report.activeCase={...row,...result};
      assert.deepEqual(result.clipped,[],row.name);assert.equal(result.horizontalOverflow,false,row.name);
      assert.ok(result.bounds.x>=0&&result.bounds.right<=row.width&&result.bounds.y>=0&&result.bounds.bottom<row.height,row.name);
      assert.ok(result.toggle.width>=44&&result.toggle.height>=44,row.name);assert.equal(result.conditionFont,row.scale==='200'?24:12);
      assert.equal(result.weather,row.width<=760||result.coarse?'none':'block');
      const overlaps=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
      assert.equal(overlaps(result.bounds,result.map),false,'Map must follow the expanded HUD');
      assert.equal(overlaps(result.bounds,result.quickControls),false,'Weather/time actions must follow the expanded HUD');
      assert.equal(overlaps(result.map,result.quickControls),false,'Map and world actions have separate space');
      if(row.readableMap){
        const map=await page.locator('#minimap').boundingBox();
        assert.ok(map.width>=140&&map.height>=140,'Short desktop windows retain a readable production-sized map');
        assert.equal(await page.locator('#hudBox').evaluate(e=>e.scrollHeight<=e.clientHeight+1),true,'Normal desktop status is visible without scrolling');
        assert.equal(await page.locator('#hudMap').evaluate(e=>e.scrollHeight<=e.clientHeight+1),true,'The map and coordinates must both fit the short desktop window');
      }
      assert.equal(overlaps(result.bounds,result.menu),false,'HUD keeps the main-menu control clear');
      if(result.coarse)for(const pad of [result.move,result.look]){
        assert.equal(overlaps(result.map,pad),false,'Map keeps the thumb controls clear');
        assert.equal(overlaps(result.quickControls,pad),false,'Utilities keep the thumb controls clear');
      }
      for(const id of ['hudToggleBtn','controlsBarBtn','quickTimeOfDay','quickWeatherMode']){const b=await page.locator('#'+id).boundingBox();assert.ok(b?.width>=44&&b?.height>=44,id);}
      for(const id of row.status||[]){
        const status=await page.locator('#'+id).boundingBox();report.activeCase.status={id,...status};
        const box={x:status.x,y:status.y,right:status.x+status.width,bottom:status.y+status.height};
        assert.equal(await page.locator('#'+id).evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'Feature status has no horizontal clipping');
      }
      if(row.status?.includes('liveGpsHud')){
        const stop=await page.locator('#liveGpsStopBtn').boundingBox(),toolbar=await page.locator('.hudUtilityActions').boundingBox();
        assert.ok(stop.y>=result.quickControls.y&&stop.y+stop.height<=toolbar.y+1,'GPS Stop is visible before scrolling');
        for(const id of ['liveGpsStopBtn','liveGpsFieldBtn','liveGpsPauseBtn','liveGpsLowPowerBtn']){await page.locator('#'+id).click({trial:true});const r=await page.locator('#'+id).boundingBox();assert.ok(r.width>=44&&r.height>=44);}
        await page.locator('#liveGpsStopBtn').scrollIntoViewIfNeeded();
      }
      if(row.selection){await page.screenshot({path:`${out}/selection-phone-open.png`});await page.locator('[data-world-selection-action]').click();assert.equal(await page.evaluate(()=>selectedWorldAction),1);await page.locator('[data-world-selection-dismiss]').click();assert.equal(await page.locator('#worldSelectionNotice').isVisible(),false);}
      await page.locator('#conditionLabel').scrollIntoViewIfNeeded();assert.ok(await page.locator('#conditionLabel').isVisible());await page.screenshot({path:`${out}/${row.name}.png`});
      await page.locator('#hudToggleBtn').click();assert.equal(await page.locator('#hudToggleBtn').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#hudHeader').isVisible(),false);
      await page.locator('#hudToggleBtn').focus();await runPrescribedGameActions(page,out,[{buttons:['space'],frames:1},{buttons:[],frames:2}],'#minimap');
      assert.equal(await page.locator('#hudToggleBtn').getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#hudHeader').isVisible(),true);
      await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement?.id),'worldCanvas');
      report.cases.push({...row,...result,collapseRestoredByKeyboard:true,textState:JSON.parse(await page.evaluate(()=>render_game_to_text()))});
    }
    report.bindingRelease=await page.evaluate(()=>{const root=document.getElementById('hud'),binding=hudLayout.bindHudLayout();binding.dispose();return ['--wx-hud-map-height','--wx-hud-utility-height','--wx-hud-utility-footer'].every(name=>!root.style.getPropertyValue(name));});
    assert.equal(report.bindingRelease,true);
    assert.deepEqual(report.errors,[]);report.passed=true;
  }catch(error){report.failure=String(error.stack||error);process.exitCode=1;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
  finally{try{if(owned)await closeOwnedBrowser(owned);}finally{await server.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}}
  console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,reader:report.reader,errors:report.errors,failure:report.failure}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await verifyHudWeatherLayout();

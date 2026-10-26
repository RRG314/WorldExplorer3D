import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import * as parse5 from 'parse5';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';

// Current product DOM, renderers and event/layout owners. Controlled service
// inputs/callbacks deliberately do not claim network admission or game movement.
const out=process.env.WE3D_VERIFY_OUTPUT_DIR||'output/verification/multiplayer-presentation-current';
await mkdir(out,{recursive:true});
const document=parse5.parse(await readFile('app/index.html','utf8')),nodes={};
function visit(n){const id=n.attrs?.find(a=>a.name==='id')?.value;if(['tab-multiplayer','globeHubOverlay','floatMenuContainer','mobileTouchControls'].includes(id))nodes[id]=n;if(n.tagName==='head')nodes.head=n;for(const child of n.childNodes||[])visit(child);}
visit(document);nodes.head.childNodes=nodes.head.childNodes.filter(n=>n.tagName!=='script');
// Keep the production ref mapping so a moved/renamed input fails this fixture.
const refsSource=await readFile('app/js/multiplayer/ui-room.js','utf8');
const mapping=Object.fromEntries([...refsSource.matchAll(/(\w+): document.getElementById\('([^']+)'\)/g)].map(m=>[m[1],m[2]]));
const html='<!doctype html><html><head><base href="/app/">'+parse5.serialize(nodes.head)+'</head><body>'+['globeHubOverlay','tab-multiplayer','floatMenuContainer','mobileTouchControls'].map(id=>parse5.serializeOuter(nodes[id])).join('')+`<canvas id="componentCanvas" tabindex="0" width="100" height="100" aria-label="Component input target"></canvas><script type="module">
import '/app/js/app-shell-fragments.js';
import * as support from '/app/js/multiplayer/ui-room-support.js';
import {normalizeCode} from '/app/js/multiplayer/rooms.js?v=67';
import {createScreenLayoutService} from '/app/js/ui/screen-layout.js';
import {createUiRoomRenderers} from '/app/js/multiplayer/ui-room-renderers.js';
import {createUiRoomEventsApi} from '/app/js/multiplayer/ui-room-events.js';
import {initAccessibility} from '/app/js/ui/accessibility.js';
const refs=Object.fromEntries(Object.entries(${JSON.stringify(mapping)}).map(([k,id])=>[k,document.getElementById(id)])),calls=[];
const room={code:'ABC123',name:'Harbor explorers',ownerUid:'one',visibility:'public',maxPlayers:10,world:{kind:'earth',lat:39.29,lon:-76.61},locationTag:{label:'Baltimore'}};
const state={authUser:{uid:'one'},entitlement:{plan:'free'},currentRoom:room,players:[{uid:'one',displayName:'You',role:'owner',mode:'walk'},{uid:'two',displayName:'Harbor explorer',role:'member',mode:'drive'}],messages:[{id:'m1',uid:'two',displayName:'Harbor explorer',text:'Meet at the harbor?'}],ownedRooms:[room,{...room,code:'DEF456',ownerUid:'two',name:'A very long saved destination title that must remain readable on a small phone screen'}],browseRooms:[room],browsePhase:'ready',featuredRooms:[],friends:[],recentPlayers:[],invites:[],leaderboard:[],artifacts:[],roomActivities:[],blockedPlayers:[],blockedPlayersReady:true};
const noop=()=>{};
const helpers={...support,normalizeCode,normalizeVisibilitySelection:v=>v==='public'?'public':'private',resolveWeeklyFeaturedWorld:s=>({kind:'earth',lat:s.lat,lon:s.lon}),applyPaintRulesToPanel:noop};
const layout=createScreenLayoutService(document),appCtx={screenLayout:layout,clearControlInputState:reason=>calls.push(['clearInput',reason])};
const ui=createUiRoomRenderers({appCtx,refs,state,helpers});
const handlers=new Proxy(ui,{get:(t,k)=>t[k]||((...args)=>{calls.push([k,...args.filter(a=>typeof a==='string')]);})});
createUiRoomEventsApi({appCtx,refs,state,helpers,handlers,callbacks:{syncCreateOptionFields:source=>calls.push(['syncCreate',source])}}).wireEvents();
const lobby=document.getElementById('tab-multiplayer'),overlay=document.getElementById('globeHubOverlay');
document.getElementById('globeHubPanelHost').append(lobby);lobby.classList.add('active');overlay.hidden=false;overlay.setAttribute('aria-hidden','false');overlay.style.cssText='position:fixed;inset:0';document.getElementById('globeHubOverlayTitle').textContent='Multiplayer';
initAccessibility();
const render=()=>{for(const name of ['renderWeeklyFeaturedCallout','renderBrowseRooms','renderOwnedRooms','renderFriends','renderRecentPlayers','renderInvites','renderLeaderboard','renderBlockedPlayers','renderRoomMeta','renderPlayerList','renderRoomActivities','renderArtifacts','renderHomeBase','renderChat','refreshPlanLabel','updateToggleStates'])ui[name]();};render();
window.mpProbe={refs,state,room,ui,layout,calls,render};window.render_game_to_text=()=>JSON.stringify({scope:'Current multiplayer component; controlled service inputs',panel:layout.snapshot().panelLayer,room:state.currentRoom?.code||'',status:refs.titleStatus.textContent,calls});window.ready=true;
</script></body></html>`;
const server=await startStaticServer({rootDir:process.cwd(),ports:[0],handleRequest:async(q,r,u)=>{if(u.pathname!=='/__multiplayer-ui')return false;r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);return true;}});
let owned,page;
const report={passed:false,scope:'Actual current lobby/room/chat DOM and render/event/layout/accessibility owners, controlled service values/callbacks. Not live service, rendered city, physical touch/keyboard or performance acceptance.',checks:[],layouts:[],errors:[]};
const sizes=[{name:'desktop',width:1440,height:900,scale:'100'},{name:'desktop-large',width:1024,height:768,scale:'200'},{name:'phone',width:390,height:844,scale:'100'},{name:'narrow-phone-large',width:320,height:740,scale:'200'},{name:'landscape',width:844,height:390,scale:'100'},{name:'landscape-large',width:844,height:390,scale:'200'}];
try{
 owned=await chromium.launchServer({channel:'chrome',headless:true});const browser=await chromium.connect(owned.wsEndpoint());page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.port+'/__multiplayer-ui');await page.waitForFunction(()=>window.ready===true);
 const press=async(selector,key='Enter')=>{await page.locator(selector).focus();await page.keyboard.press(key);};
 for(const key of ['Enter','Space']){
  await page.evaluate(()=>mpProbe.calls.length=0);await press('[data-delete-owned-room="ABC123"]',key);
  assert.deepEqual(await page.evaluate(()=>mpProbe.calls),[['handleDeleteOwnedRoom','ABC123']]);
  await page.evaluate(()=>mpProbe.calls.length=0);await press('[data-open-owned-room="ABC123"]',key);
  assert.deepEqual(await page.evaluate(()=>mpProbe.calls),[['handleOpenOwnedRoom','ABC123']]);
 }
 assert.equal(await page.locator('[data-delete-owned-room="DEF456"]').count(),0);assert.equal(await page.locator('#mpOwnedRoomsList [role="button"]').count(),0);
 report.checks.push('Native Enter/Space on saved-room Delete invokes delete only; Open invokes open only; member room has no owner delete');
 await page.locator('#mpFeaturedWeeklyBtn').click();assert.equal(await page.evaluate(()=>mpProbe.calls.at(-1)[0]),'handleJoinWeeklyFeaturedRoom');
 await page.evaluate(()=>{mpProbe.state.roomJoinBusy=true;mpProbe.ui.renderWeeklyFeaturedCallout();});assert.equal(await page.locator('#mpFeaturedWeeklyBtn').isDisabled(),true);
 await page.evaluate(()=>{mpProbe.state.roomJoinBusy=false;mpProbe.ui.renderWeeklyFeaturedCallout();});assert.equal(await page.locator('#mpFeaturedWeeklyBtn').isEnabled(),true);
 await page.locator('#mpTitleCodeInput').fill('abc123');await press('#mpTitleCodeInput');assert.equal(await page.evaluate(()=>mpProbe.calls.at(-1)[0]),'handleJoinRoom');
 await page.locator('#mpCreateRoomDetails > summary').click();assert.equal(await page.locator('#tab-multiplayer').getByRole('combobox',{name:'Who can find your room',exact:true}).count(),1);await page.locator('#mpTitleRoomNameInput').fill('Phone exploration');await page.locator('#mpTitleVisibilitySelect').selectOption('public');await page.locator('#mpTitleLocationTagInput').fill('Baltimore');await page.locator('#mpTitleCreateBtn').click();assert.equal(await page.evaluate(()=>mpProbe.calls.at(-1)[0]),'handleCreateRoom');
 report.checks.push('Weekly/code/create UI reaches existing command callbacks; busy weekly button disables and recovers');
 for(const phase of ['loading','error','ready']){
  await page.evaluate(phase=>{mpProbe.state.browseRooms=[];mpProbe.state.browsePhase=phase;mpProbe.ui.renderBrowseRooms();},phase);
  assert.match(await page.locator('#mpBrowseList').innerText(),phase==='loading'?/Loading/:phase==='error'?/unavailable.*Browse/:/No public rooms/);
 }
 await page.evaluate(()=>{mpProbe.state.authUser=null;mpProbe.state.currentRoom=null;mpProbe.render();});
 assert.equal(await page.locator('#mpFeaturedWeeklyBtn').isEnabled(),true);assert.equal(await page.locator('#mpTitleInviteBtn').isDisabled(),true);assert.equal(await page.locator('#roomPanelSaveSettingsBtn').isDisabled(),true);assert.match(await page.locator('#mpOwnedRoomsList').innerText(),/Sign in/);
 await page.evaluate(()=>{mpProbe.state.authUser={uid:'member'};mpProbe.state.currentRoom=mpProbe.room;mpProbe.ui.updateToggleStates();});assert.equal(await page.locator('#roomPanelSaveSettingsBtn').isDisabled(),true);assert.equal(await page.locator('#roomHomeBaseSaveBtn').isDisabled(),true);assert.equal(await page.locator('#roomArtifactCreateBtn').isEnabled(),true);
 report.checks.push('Distinct directory loading/error/empty states; guest weekly availability, inactive invite restrictions and member/owner editing rules preserved');
 await page.evaluate(()=>{mpProbe.state.authUser={uid:'one'};mpProbe.state.currentRoom=mpProbe.room;mpProbe.state.browseRooms=[mpProbe.room];mpProbe.render();mpProbe.ui.setStatus('Room is full. Try another room or retry shortly.',true);mpProbe.ui.setBrowseStatus('Directory unavailable. Try Browse again.',true);});
 assert.equal(await page.locator('#mpTitleStatus').getAttribute('role'),'status');assert.equal(await page.locator('#mpTitleStatus').getAttribute('data-tone'),'warning');assert.equal(await page.locator('#mpTitleStatus').evaluate(e=>e.style.color),'');
 report.checks.push('Errors retain visible text and polite live status with theme-owned color');
 const selection=process.env.WE3D_MP_LAYOUTS;const names=selection&&selection!=='none'?selection.split(','):null;
 if(names)for(const name of names)assert.ok(sizes.some(s=>s.name===name),'Unknown layout: '+name);
 for(const size of sizes.filter(s=>selection!=='none'&&(!names||names.includes(s.name)))){
  await page.setViewportSize({width:size.width,height:size.height});await page.evaluate(scale=>{document.documentElement.dataset.we3dTextScale=scale;document.getElementById('globeHubOverlay').hidden=false;document.getElementById('globeHubPanelHost').scrollTop=0;document.getElementById('floatMenuContainer').classList.remove('show');document.getElementById('mobileTouchControls').classList.remove('show');document.querySelectorAll('#tab-multiplayer details').forEach(d=>d.open=true);},size.scale);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await page.locator('#tab-multiplayer').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'Lobby horizontal overflow '+size.name);
  for(const id of ['mpFeaturedWeeklyBtn','mpTitleJoinBtn','mpTitleCreateBtn','mpTitlePanelBtn','mpTitleInviteBtn','mpTitleLeaveBtn','mpBrowseBtn','mpTitleTrialBtn','mpAddFriendBtn']){
   const el=page.locator('#'+id);await el.scrollIntoViewIfNeeded();await el.click({trial:true});const b=await el.boundingBox();assert.ok(b.height>=44&&b.width>=44,id+' touch target');assert.ok(b.x>=0&&b.x+b.width<=size.width+1,id+' viewport');
  }
  const missing=await page.locator('#tab-multiplayer input,#tab-multiplayer select').evaluateAll(els=>els.filter(e=>!e.labels?.length).map(e=>e.id));assert.deepEqual(missing,[]);
  await page.locator('#mpFeaturedWeeklyBtn').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+size.name+'-lobby.png'});
  await page.evaluate(()=>{document.getElementById('globeHubOverlay').hidden=true;document.getElementById('floatMenuContainer').classList.add('show');document.getElementById('mobileTouchControls').classList.add('show','mode-walking');mpProbe.ui.openRoomPanel();document.querySelectorAll('#roomPanelModal details').forEach(d=>d.open=false);document.querySelector('.room-panel-body').scrollTop=0;});
  const rect=await page.locator('.room-panel').boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=size.width+1&&rect.y+rect.height<=size.height+1,'Room viewport '+size.name);
  assert.equal(await page.locator('.room-panel-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'Room horizontal overflow '+size.name);
  await page.screenshot({path:out+'/'+size.name+'-room.png'});
  await page.evaluate(()=>document.querySelectorAll('#roomPanelModal details').forEach(d=>d.open=true));
  for(const id of ['roomPanelCloseBtn','roomPanelCreateBtn','roomPanelSaveSettingsBtn','roomHomeBaseSaveBtn','roomArtifactCreateBtn','roomActivityOpenBtn']){const el=page.locator('#'+id);await el.scrollIntoViewIfNeeded();await el.click({trial:true});const b=await el.boundingBox();assert.ok(b.height>=44&&b.width>=44,id+' touch target');}
  assert.equal(await page.locator('.room-panel-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'Expanded room overflow '+size.name);
  if(size.name==='narrow-phone-large'){await page.locator('#roomPanelNameInput').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/narrow-phone-large-settings.png'});}
  const font=await page.locator('#roomPanelNameInput').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));assert.ok(font>=(size.scale==='200'?27:13));
  await page.locator('#roomPanelCloseBtn').focus();await runPrescribedGameActions(page,out,[{buttons:['space'],frames:2},{buttons:[],frames:3}],'#componentCanvas');assert.equal(await page.locator('#roomPanelModal').getAttribute('aria-hidden'),'true');
  await page.evaluate(()=>mpProbe.ui.openRoomPanel());await press('#roomPanelCloseBtn','Escape');assert.equal(await page.locator('#roomPanelModal').getAttribute('aria-hidden'),'true');
  report.layouts.push({...size,font,roomBounds:rect,allActionsReachable:true,textState:JSON.parse(await page.evaluate(()=>window.render_game_to_text()))});
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.failure=e.stack;process.exitCode=1;await page?.screenshot({path:out+'/failure.png'}).catch(()=>{});}
finally{try{if(owned)await closeOwnedBrowser(owned);}finally{await server.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2));}}
console.log(JSON.stringify(report));

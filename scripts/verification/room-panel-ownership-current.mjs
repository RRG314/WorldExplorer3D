import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import * as parse5 from 'parse5';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';

// Real current markup/controllers/layout owner; no world renderer, account or
// admission fixture. Network/gameplay acceptance is deliberately a separate run.
const out=process.env.WE3D_VERIFY_OUTPUT_DIR||'output/verification/room-panel-ownership-current';
await mkdir(out,{recursive:true});
const doc=parse5.parse(await readFile('app/index.html','utf8')),nodes={};
function visit(n){const id=n.attrs?.find(a=>a.name==='id')?.value;if(['floatMenuContainer','mobileTouchControls'].includes(id))nodes[id]=n;if(n.tagName==='head')nodes.head=n;for(const child of n.childNodes||[])visit(child);}
visit(doc);nodes.head.childNodes=nodes.head.childNodes.filter(n=>n.tagName!=='script');
const html='<!doctype html><html><head><base href="/app/">'+parse5.serialize(nodes.head)+'</head><body>'+['floatMenuContainer','mobileTouchControls'].map(id=>parse5.serializeOuter(nodes[id])).join('')+`<script type="module">
import '/app/js/app-shell-fragments.js';
import {createScreenLayoutService} from '/app/js/ui/screen-layout.js';
import {createUiRoomRenderers} from '/app/js/multiplayer/ui-room-renderers.js';
import {createUiRoomEventsApi} from '/app/js/multiplayer/ui-room-events.js';
import {initAccessibility} from '/app/js/ui/accessibility.js';
const refs=Object.fromEntries(Object.entries({roomPanelModal:'roomPanelModal',roomPanelCloseBtn:'roomPanelCloseBtn',chatDrawer:'roomChatDrawer',chatCloseBtn:'roomChatCloseBtn',chatInput:'roomChatInput',chatMessages:'roomChatMessages'}).map(([k,id])=>[k,document.getElementById(id)]));
const layout=createScreenLayoutService(document),cleared=[],state={currentRoom:{code:'ABC123',ownerUid:'one'},authUser:{uid:'one'},entitlement:{},blockedPlayersReady:true,blockedPlayers:[],messages:[{id:'m1',uid:'two',displayName:'Another explorer',text:'Meet at the harbor?'},{id:'m2',uid:'one',displayName:'You',text:'On my way.'}]};
const noop=()=>{},helpers=new Proxy({safeHtml:v=>v,escapeHtml:v=>v,chatMaxLength:500},{get:(t,k)=>t[k]||noop});
const appCtx={screenLayout:layout,clearControlInputState:reason=>cleared.push(reason)};
const ui=createUiRoomRenderers({appCtx,refs,state,helpers});
const handlers=new Proxy(ui,{get:(t,k)=>t[k]||noop});
createUiRoomEventsApi({appCtx,refs,state,helpers,handlers,callbacks:new Proxy({},{get:()=>noop})}).wireEvents();
document.getElementById('floatMenuContainer').classList.add('show');
document.getElementById('mobileTouchControls').classList.add('show','mode-walking');
initAccessibility();ui.renderChat();window.roomUiProbe={ui,layout,cleared,state};window.ready=true;
</script></body></html>`;
const server=await startStaticServer({rootDir:process.cwd(),ports:[0],handleRequest:async(q,r,u)=>{
  if(u.pathname!=='/__room-panels')return false;r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);return true;
}});
let owned,page;
const report={passed:false,scope:'Actual room/chat DOM, current renderer/event/accessibility owners and responsive CSS, with controlled message/session input. No 3D, live account, OS keyboard or hosted multiplayer acceptance.',checks:[],errors:[]};
try{
  owned=await chromium.launchServer({channel:'chrome',headless:true});const browser=await chromium.connect(owned.wsEndpoint());
  page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(10000);
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.port}/__room-panels`);await page.waitForFunction(()=>window.ready===true);
  const visible=async id=>page.locator('#'+id).evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;});
  for(const size of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}])for(const scale of ['100','200']){
    await page.setViewportSize(size);await page.evaluate(scale=>{document.documentElement.dataset.we3dTextScale=scale;roomUiProbe.ui.openRoomPanel();},scale);
    assert.equal(await page.locator('#roomPanelModal').getAttribute('aria-hidden'),'false');
    assert.equal(await visible('floatMenuContainer'),false);assert.equal(await visible('mobileTouchControls'),false);
    await page.locator('#roomPanelCloseBtn').focus();await page.keyboard.press('Escape');
    assert.equal(await page.locator('#roomPanelModal').getAttribute('aria-hidden'),'true');
    assert.equal(await visible('floatMenuContainer'),true);
    await page.evaluate(()=>roomUiProbe.ui.setChatOpen(true));await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'roomChatInput');
    assert.equal(await visible('mobileTouchControls'),false);assert.equal(await visible('floatMenuContainer'),false);
    const rect=await page.locator('#roomChatDrawer').boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=size.width+1&&rect.y+rect.height<=size.height+1);
    assert.equal(await page.locator('#roomChatDrawer').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
    for(const id of ['roomChatCloseBtn','roomChatSendBtn']){await page.locator('#'+id).scrollIntoViewIfNeeded();await page.locator('#'+id).click({trial:true});const b=await page.locator('#'+id).boundingBox();assert.ok(b.height>=44&&b.width>=44);}
    if(scale==='100')await page.screenshot({path:`${out}/chat-${size.width}.png`});
    await page.locator('#roomChatInput').focus();await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>roomUiProbe.layout.snapshot().panelLayer),'');assert.equal(await page.locator('#roomChatDrawer').evaluate(e=>e.inert),true);
    assert.equal(await visible('floatMenuContainer'),true);assert.equal(await visible('mobileTouchControls'),true);
    report.checks.push(`Room visibility, panel input isolation, chat reflow, 44px actions, owned Escape and restored controls: ${size.width}×${size.height} at ${scale}%`);
  }
  await page.evaluate(()=>{roomUiProbe.ui.setChatOpen(true);roomUiProbe.layout.setPanelLayer('backpack',true);});
  assert.equal(await page.evaluate(()=>roomUiProbe.state.chatOpen),false);
  assert.equal(await page.evaluate(()=>roomUiProbe.layout.snapshot().panelLayer),'backpack');
  report.checks.push('Newer Backpack ownership automatically closes chat without clearing the newer panel');
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.failure=e.stack;process.exitCode=1;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{try{if(owned)await closeOwnedBrowser(owned);}finally{await server.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}}
console.log(JSON.stringify(report));

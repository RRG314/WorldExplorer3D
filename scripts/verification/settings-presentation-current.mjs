import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import * as parse5 from 'parse5';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';

const out=process.env.WE3D_VERIFY_OUTPUT_DIR||'output/verification/settings-presentation-current';await mkdir(out,{recursive:true});
const doc=parse5.parse(await readFile('app/index.html','utf8')),nodes={};
function visit(n){const id=n.attrs?.find(a=>a.name==='id')?.value;if(['tab-settings','tab-controls','globeHubOverlay','accessibilitySettings'].includes(id))nodes[id]=n;if(n.tagName==='head')nodes.head=n;for(const child of n.childNodes||[])visit(child);}
visit(doc);nodes.head.childNodes=nodes.head.childNodes.filter(n=>n.tagName!=='script');
const html='<!doctype html><html><head><base href="/app/">'+parse5.serialize(nodes.head)+'</head><body>'+['globeHubOverlay','tab-settings','tab-controls','accessibilitySettings'].map(id=>parse5.serializeOuter(nodes[id])).join('')+`<canvas id="componentCanvas" width="1" height="1"></canvas><script type="module">
import {setupSettingsUi} from '/app/js/ui/settings.js';
import {setupGlobeHub} from '/app/js/ui/title-screen/globe-hub.js';
import {initAccessibility} from '/app/js/ui/accessibility.js';
import {readRegionalSceneryPreference} from '/app/js/terrain/regional-scenery-scheduler.js';
import {oceanStreamingPreference} from '/app/js/ocean/voyage-store.js';
let quality='med',boost=false,ssao=false,regional=false;const calls=[];const supported=new URLSearchParams(location.search).get('ssao')!=='0';
const ctx={apiConfig:{},getRenderQualityLevel:()=>quality,setRenderQualityLevel:value=>{quality=value;boost=value==='high';calls.push(['quality',value]);},getHighQualityEnabled:()=>boost,setHighQualityEnabled:(value,{fallbackLevel})=>{boost=value;quality=value?'high':fallbackLevel;calls.push(['boost',value]);},getSsaoEnabled:()=>ssao,canUseSsao:()=>supported,setSsaoEnabled:value=>(ssao=supported&&value),getRegionalSceneryState:()=>({enabled:regional}),setRegionalSceneryEnabled:value=>{regional=value;calls.push(['regional',value]);},updatePerfPanel:()=>calls.push(['perfRefresh'])};
if(localStorage.getItem('we3d.fixture.player-record')===null)localStorage.setItem('we3d.fixture.player-record','preserved');
const hub=setupGlobeHub({globeSelector:{},onEarthMode(){},onLaunchMode(){},primeMultiplayerUi(){}});setupSettingsUi(ctx);initAccessibility();hub.openPanel('settings');document.getElementById('globeHubOverlay').style.cssText='position:fixed;inset:0';
window.settingsProbe={ctx,hub,calls,accessibility:document.getElementById('accessibilitySettings'),read:()=>({quality,boost,ssao,supported,regional,earthPreference:readRegionalSceneryPreference(),oceanPreference:oceanStreamingPreference(),playerRecord:localStorage.getItem('we3d.fixture.player-record')})};
window.render_game_to_text=()=>JSON.stringify({scope:'Actual settings component; controlled graphics callbacks, real preference/credential/accessibility owners',...settingsProbe.read(),status:document.getElementById('worldExplorationStatus').textContent});window.ready=true;
</script></body></html>`;
const server=await startStaticServer({rootDir:process.cwd(),ports:[0],handleRequest:async(q,r,u)=>{if(u.pathname!=='/__settings-ui')return false;r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);return true;}});
let owned,page;const report={passed:false,scope:'Current settings/accessibility DOM and actual setting, hub and accessibility owners; controlled graphics/device/clipboard callbacks. Real owned-profile preference storage and credential owner, no world, provider API, OS clipboard or physical device.',checks:[],layouts:[],errors:[]};
const sizes=[{name:'desktop',width:1440,height:900,scale:'100'},{name:'desktop-large',width:1024,height:768,scale:'200'},{name:'phone',width:390,height:844,scale:'100'},{name:'narrow-phone-large',width:320,height:740,scale:'200'},{name:'landscape',width:844,height:390,scale:'100'},{name:'landscape-large',width:844,height:390,scale:'200'}];
try{
 owned=await chromium.launchServer({channel:'chrome',headless:true});const browser=await chromium.connect(owned.wsEndpoint());page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(8000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.port+'/__settings-ui');await page.waitForFunction(()=>window.ready===true);
 const settings=page.locator('#tab-settings');assert.equal(await settings.getByRole('combobox',{name:'Render quality',exact:true}).count(),1);
 await settings.getByRole('combobox',{name:'Render quality',exact:true}).selectOption('high');assert.equal(await page.evaluate(()=>settingsProbe.read().quality),'high');
 await page.locator('#highQualityToggle').uncheck();assert.equal(await page.evaluate(()=>settingsProbe.read().boost),false);assert.equal(await page.locator('#renderQualitySelect').inputValue(),'med');
 await page.locator('#ssaoToggle').check();assert.equal(await page.evaluate(()=>settingsProbe.read().ssao),true);assert.match(await page.locator('#perfSettingsStatus').innerText(),/armed.*High/);
 report.checks.push('Graphics controls delegate to existing quality/boost/SSAO owners and reflect the returned current tier');
 for(const id of ['regionalSceneryToggle','oceanContinuousToggle']){await page.locator('#'+id).check();assert.equal(await page.evaluate(id=>id==='regionalSceneryToggle'?settingsProbe.read().earthPreference:settingsProbe.read().oceanPreference,id),true);await page.locator('#'+id).uncheck();}
 assert.equal(await page.evaluate(()=>settingsProbe.read().regional),false);assert.equal(await page.evaluate(()=>settingsProbe.read().oceanPreference),false);
 report.checks.push('Selected-location default can be restored; optional Earth/ocean preferences use existing stores without a world reload');
 await settings.locator('.settings-optional > summary').click();await settings.getByLabel('ATTOM API key',{exact:true}).fill('fixture-only-attom');await settings.getByLabel('RentCast API key',{exact:true}).fill('fixture-only-rentcast');await page.locator('#saveApiKey').click();
 assert.match(await page.locator('#providerKeysStatus').innerText(),/2 provider keys ready/);assert.equal(await page.locator('#saveApiKey').innerText(),'Use Keys for This Visit');
 assert.equal(await page.evaluate(()=>settingsProbe.ctx.apiConfig.attom==='fixture-only-attom'&&settingsProbe.ctx.apiConfig.rentcast==='fixture-only-rentcast'),true);
 assert.equal(await page.evaluate(()=>localStorage.getItem('attomApiKey')===null&&localStorage.getItem('rentcastApiKey')===null),true);
 await settings.getByLabel('ATTOM API key',{exact:true}).fill('');await settings.getByLabel('RentCast API key',{exact:true}).fill('');await page.locator('#saveApiKey').click();assert.match(await page.locator('#providerKeysStatus').innerText(),/All optional provider keys cleared/);assert.equal(await page.evaluate(()=>settingsProbe.ctx.apiConfig.attom===null&&settingsProbe.ctx.apiConfig.rentcast===null),true);
 report.checks.push('Visit-only keys set and clear through the actual credential owner, with stable button name/live feedback and no private storage entries');
 await page.locator('#copySupportReceiptBtn').click();assert.match(await page.locator('#supportReceiptStatus').innerText(),/still loading/);
 await page.evaluate(()=>{globalThis.getWorldExplorerSupportReceipt=()=>({schemaVersion:1,buildId:'fixture-build',events:[]});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedReceipt=text;}}});});await page.locator('#copySupportReceiptBtn').click();assert.equal(await page.evaluate(()=>JSON.parse(window.copiedReceipt).buildId),'fixture-build');assert.match(await page.locator('#supportReceiptStatus').innerText(),/Report copied/);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));await page.locator('#copySupportReceiptBtn').click();assert.equal(await page.evaluate(()=>document.activeElement?.id),'supportReceiptPreview');assert.match(await page.locator('#supportReceiptStatus').innerText(),/Select and copy/);assert.equal(await page.locator('#supportReceiptPreview').isVisible(),true);
 report.checks.push('Support-report loading, successful controlled copy and clipboard-unavailable manual recovery preserve readable selectable output');
 await page.evaluate(()=>settingsProbe.hub.openPanel('controls'));assert.equal(await page.evaluate(()=>settingsProbe.accessibility===document.getElementById('accessibilitySettings')&&settingsProbe.accessibility.parentElement.id==='tab-controls'),true);
 await page.locator('#accessibilityTextScale').selectOption('200');await page.evaluate(()=>settingsProbe.hub.openPanel('settings'));assert.equal(await page.evaluate(()=>settingsProbe.accessibility===document.getElementById('accessibilitySettings')&&settingsProbe.accessibility.parentElement.id==='tab-settings'),true);assert.equal(await page.locator('#accessibilityTextScale').inputValue(),'200');
 await page.locator('#accessibilityReducedEffects').focus();await runPrescribedGameActions(page,out,[{buttons:['space'],frames:1},{buttons:[],frames:2}],'#componentCanvas');assert.equal(await page.evaluate(()=>document.documentElement.dataset.we3dEffects),'reduce');
 await page.locator('#accessibilityReset').click();assert.equal(await page.locator('#accessibilityTextScale').inputValue(),'100');assert.equal(await page.evaluate(()=>settingsProbe.read().playerRecord),'preserved');
 report.checks.push('One actual accessibility component retains identity/preferences moving Settings↔Quick Start; native Space action and Reset preserve unrelated records');
 const selection=process.env.WE3D_SETTINGS_LAYOUTS;const names=selection&&selection!=='none'?selection.split(','):null;if(names)for(const name of names)assert.ok(sizes.some(s=>s.name===name),'Unknown layout '+name);
 for(const size of sizes.filter(s=>selection!=='none'&&(!names||names.includes(s.name)))){
  await page.setViewportSize({width:size.width,height:size.height});await page.locator('#accessibilityTextScale').selectOption(size.scale);await page.locator('#accessibilityHighContrast').setChecked(size.name==='landscape-large');await page.evaluate(()=>document.getElementById('globeHubPanelHost').scrollTop=0);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await settings.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'Settings overflow '+size.name);assert.equal(await page.locator('#accessibilitySettings').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'Accessibility overflow '+size.name);
  const resetFits=await page.locator('#accessibilityReset').evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return r.height<=Math.max(parseFloat(s.minHeight)||0,parseFloat(s.lineHeight)+parseFloat(s.paddingTop)+parseFloat(s.paddingBottom)+parseFloat(s.borderTopWidth)+parseFloat(s.borderBottomWidth))+1;});assert.equal(resetFits,true,'Reset word wraps '+size.name);
  await page.screenshot({path:out+'/'+size.name+'-settings.png'});
  for(const id of ['accessibilityReset','renderQualitySelect','saveApiKey','copySupportReceiptBtn']){const el=page.locator('#'+id);await el.scrollIntoViewIfNeeded();const b=await el.boundingBox();assert.ok(b.width>=44&&b.height>=44,id+' target '+size.name);assert.ok(b.x>=0&&b.x+b.width<=size.width+1,id+' horizontal clipping '+size.name);if(await el.evaluate(e=>e.tagName==='BUTTON'))await el.click({trial:true});}
  for(const id of ['highQualityToggle','ssaoToggle','regionalSceneryToggle','oceanContinuousToggle','accessibilityReducedMotion']){const label=page.locator('#'+id).locator('..');const b=await label.boundingBox();assert.ok(b.height>=44,id+' label target');}
  const font=await page.locator('#renderQualitySelect').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));assert.ok(font>=(size.scale==='200'?27:13),'Text scaling');
  if(size.name==='phone'||size.name==='narrow-phone-large'){await page.locator('#renderQualitySelect').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+size.name+'-graphics.png'});}
  if(size.name==='phone'){await settings.locator('.settings-optional > summary').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:out+'/phone-provider-data.png'});await page.locator('#supportReceiptTitle').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:out+'/phone-support.png'});}
  report.layouts.push({...size,font,textState:JSON.parse(await page.evaluate(()=>render_game_to_text()))});
 }
 await page.evaluate(()=>localStorage.setItem('we3d.fixture.player-record','cross-mount-sentinel'));
 await page.goto('http://127.0.0.1:'+server.port+'/__settings-ui?ssao=0');await page.waitForFunction(()=>window.ready===true);assert.equal(await page.locator('#ssaoToggle').isDisabled(),true);assert.equal(await page.evaluate(()=>settingsProbe.read().playerRecord),'cross-mount-sentinel');report.checks.push('Unsupported device tier retains disabled SSAO; fresh mount preserves unrelated owned-profile data');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.failure=e.stack;process.exitCode=1;await page?.screenshot({path:out+'/failure.png'}).catch(()=>{});}
finally{try{if(owned)await closeOwnedBrowser(owned);}finally{await server.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2));}}
console.log(JSON.stringify(report));

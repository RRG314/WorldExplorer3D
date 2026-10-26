import assert from 'node:assert/strict';
import{mkdir,readFile,writeFile}from'node:fs/promises';
import*as parse5 from'parse5';
import{chromium}from'playwright';
import{startStaticServer}from'./static-server.mjs';
import{closeOwnedBrowser}from'./owned-browser.mjs';
import{runPrescribedGameActions}from'./prescribed-game-actions.mjs';
const out=process.env.WE3D_VERIFY_OUTPUT_DIR||'output/verification/keyboard-guide-ownership-current';await mkdir(out,{recursive:true});
const doc=parse5.parse(await readFile('app/index.html','utf8')),nodes={};function visit(n){const id=n.attrs?.find(a=>a.name==='id')?.value;if(['tab-controls','tab-settings','globeHubOverlay','controlsTab'].includes(id))nodes[id]=n;if(n.tagName==='head')nodes.head=n;for(const child of n.childNodes||[])visit(child);}visit(doc);nodes.head.childNodes=nodes.head.childNodes.filter(n=>n.tagName!=='script');
const html='<!doctype html><html><head><base href="/app/">'+parse5.serialize(nodes.head)+'</head><body>'+['globeHubOverlay','tab-controls','tab-settings','controlsTab'].map(id=>parse5.serializeOuter(nodes[id])).join('')+`<canvas id="componentCanvas" width="1" height="1"></canvas><script type="module">
import{initKeyboardBindingUi}from'/app/js/controls/keyboard-binding-ui.js';
import{KEYBOARD_BINDING_ACTIONS,keyboardBindingCode,keyboardBindingsSnapshot,resetKeyboardBindings,setKeyboardBinding}from'/app/js/controls/keyboard-bindings.js?v=3';
import{keyboardControlActions}from'/app/js/controls/action-input.js?v=14';
import{getLifecycleRegistrySnapshot}from'/app/js/runtime/lifecycle-scope.js?v=2';
import{setupGlobeHub}from'/app/js/ui/title-screen/globe-hub.js';
import{initAccessibility}from'/app/js/ui/accessibility.js';
initKeyboardBindingUi();resetKeyboardBindings();const hub=setupGlobeHub({globeSelector:{},onEarthMode(){},onLaunchMode(){},primeMultiplayerUi(){}});initAccessibility();hub.openPanel('controls');document.getElementById('globeHubOverlay').style.cssText='position:fixed;inset:0';
const details=document.querySelector('#keyboardBindingSettings details');details.open=true;const observed=[];window.addEventListener('keydown',e=>observed.push({code:e.code,prevented:e.defaultPrevented}));
window.bindingProbe={hub,keyboardBindingCode,keyboardBindingsSnapshot,resetKeyboardBindings,setKeyboardBinding,keyboardControlActions,getLifecycleRegistrySnapshot,details,observed,initKeyboardBindingUi};
window.render_game_to_text=()=>JSON.stringify({scope:'Actual binding UI/model/action readers; controlled component, no game',bindings:keyboardBindingsSnapshot().bindings,status:document.getElementById('keyboardBindingStatus').textContent,overlayOpen:!document.getElementById('globeHubOverlay').hidden});window.ready=true;
</script></body></html>`;
const server=await startStaticServer({rootDir:process.cwd(),ports:[0],handleRequest:async(q,r,u)=>{if(u.pathname!=='/__keyboard-ui')return false;r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);return true;}});
let owned,page;const report={passed:false,scope:'Current binding/hub/accessibility DOM and owners, actual saved-binding and action-reader services, owned-profile keyboard events. No city, physical keyboard, travel admission or FPS acceptance.',checks:[],layouts:[],errors:[]};
const sizes=[{name:'desktop',width:1440,height:900,scale:'100'},{name:'desktop-large',width:1024,height:768,scale:'200'},{name:'phone',width:390,height:844,scale:'100'},{name:'narrow-phone-large',width:320,height:740,scale:'200'},{name:'landscape',width:844,height:390,scale:'100'},{name:'landscape-large',width:844,height:390,scale:'200'}];
try{
 owned=await chromium.launchServer({channel:'chrome',headless:true});const browser=await chromium.connect(owned.wsEndpoint());page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(8000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:'+server.port+'/__keyboard-ui');await page.waitForFunction(()=>window.ready===true);
 const button=action=>page.locator('[data-binding-action="'+action+'"]');
 const begin=async()=>{await page.evaluate(()=>{bindingProbe.hub.openPanel('controls');bindingProbe.details.open=true;});await button('move_forward').click();};
 const unchanged=async()=>assert.equal(await page.evaluate(()=>bindingProbe.keyboardBindingCode('move_forward')),'KeyW');
 await begin();await page.evaluate(()=>bindingProbe.hub.closePanel());await page.keyboard.press('z');await unchanged();assert.equal(await page.evaluate(()=>bindingProbe.observed.at(-1).code),'KeyZ');
 await begin();await page.evaluate(()=>bindingProbe.hub.openPanel('settings'));await page.keyboard.press('y');await unchanged();
 report.checks.push('Closing or switching through the actual hub releases capture; the next key reaches the normal event path without changing a binding');
 await begin();await page.keyboard.press('Escape');await unchanged();assert.equal(await page.locator('#globeHubOverlay').getAttribute('aria-hidden'),'false');assert.match(await page.locator('#keyboardBindingStatus').innerText(),/cancelled/);await page.keyboard.press('Escape');assert.equal(await page.locator('#globeHubOverlay').getAttribute('aria-hidden'),'true');
 await begin();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.press('x');await unchanged();
 await begin();await page.locator('#globeHubOverlayCloseBtn').focus();await page.keyboard.press('x');await unchanged();
 await begin();await page.evaluate(()=>bindingProbe.details.open=false);await page.keyboard.press('z');await unchanged();
 await begin();await page.evaluate(()=>document.getElementById('globeHubOverlay').hidden=true);await page.keyboard.press('z');await unchanged();
 report.checks.push('Escape cancels before closing; blur, focus departure, collapsed details and hidden-owner guard release capture');
 await begin();await page.keyboard.press('Digit1');await unchanged();assert.match(await page.locator('#keyboardBindingStatus').innerText(),/reserved/);
 await page.evaluate(()=>window.originalBindingButton=document.querySelector('[data-binding-action="move_forward"]'));
 await page.keyboard.press('z');assert.equal(await page.evaluate(()=>bindingProbe.keyboardBindingCode('move_forward')),'KeyZ');assert.equal(await page.evaluate(()=>document.activeElement===window.originalBindingButton),true);
 const guideCount=await page.locator('[data-keyboard-actions~="move_forward"]').count();assert.ok(guideCount>=8);
 for(const element of await page.locator('[data-keyboard-actions~="move_forward"]').all())assert.match(await element.textContent(),/Z/);
 assert.equal(await page.evaluate(()=>bindingProbe.keyboardControlActions({KeyZ:true},'walk').move),1);assert.equal(await page.evaluate(()=>bindingProbe.keyboardControlActions({KeyW:true},'drive').throttle),0);
 await button('move_backward').click();await page.keyboard.press('z');assert.equal(await page.evaluate(()=>bindingProbe.keyboardBindingCode('move_forward')),'KeyS');assert.equal(await page.evaluate(()=>bindingProbe.keyboardBindingCode('move_backward')),'KeyZ');assert.equal(await page.evaluate(()=>bindingProbe.keyboardControlActions({KeyS:true},'drive').throttle),1);
 report.checks.push('Reserved quick slots stay protected; chosen keys and collision swaps reach actual action readers and both help views, with stable row/button focus');
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const mutations=await page.evaluate(async()=>{const list=[];const observer=new MutationObserver(rows=>list.push(...rows));observer.observe(document.getElementById('tab-controls'),{subtree:true,childList:true,attributes:true,characterData:true});bindingProbe.setKeyboardBinding('move_forward',bindingProbe.keyboardBindingCode('move_forward'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));observer.disconnect();return list.length;});assert.equal(mutations,0);
 await page.locator('[data-binding-reset]').click();await unchanged();assert.equal(await page.evaluate(()=>bindingProbe.initKeyboardBindingUi()),false);assert.equal(await page.locator('#keyboardBindingSettings').count(),1);
 assert.equal(await page.evaluate(()=>bindingProbe.getLifecycleRegistrySnapshot().owners['keyboard-binding-ui'].scopes),1);
 report.checks.push('Unchanged binding publication produces zero observed guide mutations; Reset and repeat initialization retain one component/owned lifecycle');
 const selection=process.env.WE3D_KEYBOARD_LAYOUTS;const names=selection&&selection!=='none'?selection.split(','):null;if(names)for(const name of names)assert.ok(sizes.some(s=>s.name===name),'Unknown layout '+name);
 for(const size of sizes.filter(s=>selection!=='none'&&(!names||names.includes(s.name)))){
  await page.setViewportSize({width:size.width,height:size.height});await page.locator('#accessibilityTextScale').selectOption(size.scale);await page.evaluate(()=>{document.getElementById('globeHubPanelHost').scrollTop=0;bindingProbe.details.open=true;});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await page.locator('#tab-controls').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'Quick Start overflow '+size.name);assert.equal(await page.locator('#keyboardBindingSettings').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'Binding overflow '+size.name);
  await page.locator('#keyboardBindingSettings > details > summary').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+size.name+'-bindings.png'});
  if(size.name==='phone'||size.name==='narrow-phone-large'){await button('move_forward').locator('..').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:out+'/'+size.name+'-binding-row.png'});}
  for(const id of ['move_forward','use_item','boat']){const el=button(id);await el.scrollIntoViewIfNeeded();await el.click({trial:true});const b=await el.boundingBox();assert.ok(b.height>=44&&b.width>=44,'Change target '+id);}
  await page.locator('[data-binding-reset]').scrollIntoViewIfNeeded();await page.locator('[data-binding-reset]').click({trial:true});const reset=await page.locator('[data-binding-reset]').boundingBox();assert.ok(reset.height>=44&&reset.width>=44);
  await page.locator('.control-guide-section').first().scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+size.name+'-guide.png'});
  const font=await button('move_forward').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));assert.ok(font>=(size.scale==='200'?27:13));report.layouts.push({...size,font,guideCount});
 }
 await page.evaluate(()=>{document.documentElement.dataset.we3dTextScale='100';bindingProbe.hub.openPanel('controls');bindingProbe.details.open=true;});await button('move_forward').focus();await runPrescribedGameActions(page,out,[{buttons:['enter'],frames:1},{buttons:[],frames:2}],'#componentCanvas');assert.match(await button('move_forward').textContent(),/Press a key/);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await page.keyboard.press('z');await unchanged();assert.equal(await page.evaluate(()=>bindingProbe.getLifecycleRegistrySnapshot().owners['keyboard-binding-ui'].scopes),1);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));assert.equal(await page.evaluate(()=>bindingProbe.getLifecycleRegistrySnapshot().owners['keyboard-binding-ui']||null),null);
 report.checks.push('Native Enter starts capture; cached-page departure cancels while retaining the lifecycle; final departure releases all owned listeners');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.failure=e.stack;process.exitCode=1;await page?.screenshot({path:out+'/failure.png'}).catch(()=>{});}
finally{try{if(owned)await closeOwnedBrowser(owned);}finally{await server.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2));}}
console.log(JSON.stringify(report));

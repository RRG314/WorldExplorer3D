import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4497, 4498] });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/app/js/ui/accessibility.js`);
  await page.setContent(`<style>[hidden],.hidden{display:none!important}</style><button id="launch">Open</button><div id="hud"></div><div id="controls"></div><div id="dialogs"></div><div id="accessibilityAnnouncements" aria-live="polite"></div>`);
  const result = await page.evaluate(async () => {
    const {initAccessibility} = await import('/app/js/ui/accessibility.js');
    const api = initAccessibility();
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    let layoutReads = 0, documentScans = 0;
    const rect = HTMLElement.prototype.getBoundingClientRect;
    const query = document.querySelectorAll.bind(document);
    HTMLElement.prototype.getBoundingClientRect = function (...args) { layoutReads++; return rect.apply(this,args); };
    document.querySelectorAll = function (...args) { documentScans++; return query(...args); };
    const hud = document.getElementById('hud');
    // Install a closed modal: it must not be repeatedly measured for HUD text.
    document.getElementById('dialogs').innerHTML = '<section role="dialog" aria-modal="true" hidden id="testDialog" tabindex="-1"><button id="first">First</button><button id="last">Last</button></section>';
    await tick(); layoutReads = 0; documentScans = 0;
    for(let i=0;i<40;i++){hud.textContent=String(i);hud.className=i%2?'fast':'slow';await tick();}
    const idle = {layoutReads, documentScans};
    document.getElementById('controls').innerHTML='<div class="floatItem" id="dynamic">Fly</div><div id="ctrlHeader">Controls</div><div id="ctrlContent" class="hidden"></div>';
    await tick();
    const control = document.getElementById('dynamic');
    let clicks=0;control.addEventListener('click',()=>clicks++);
    control.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    control.classList.add('on');document.getElementById('ctrlContent').classList.remove('hidden');await tick();
    const semantics={role:control.getAttribute('role'),tabIndex:control.tabIndex,pressed:control.getAttribute('aria-pressed'),expanded:document.getElementById('ctrlHeader').getAttribute('aria-expanded'),clicks};
    document.getElementById('launch').focus();
    const dialog=document.getElementById('testDialog');dialog.hidden=false;await tick();
    const opened={modal:api.snapshot().activeModalId,focus:document.activeElement.id};
    document.getElementById('last').focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
    const wrapped=document.activeElement.id;
    dialog.hidden=true;await tick();const restored=document.activeElement.id;
    // Ancestor visibility and a newly assigned dialog role both need handling.
    document.getElementById('dialogs').hidden=true;dialog.hidden=false;await tick();
    const hiddenAncestor=api.snapshot().activeModalId;
    document.getElementById('dialogs').hidden=false;await tick();const visibleAncestor=api.snapshot().activeModalId;
    dialog.remove();await tick();const removed=api.snapshot().activeModalId;
    return {idle,semantics,opened,wrapped,restored,hiddenAncestor,visibleAncestor,removed};
  });
  console.log(JSON.stringify(result));
  assert.deepEqual(result.idle,{layoutReads:0,documentScans:0},'HUD mutations must not rescan controls or measure unrelated dialogs');
  assert.deepEqual(result.semantics,{role:'button',tabIndex:0,pressed:'true',expanded:'true',clicks:1});
  assert.deepEqual(result.opened,{modal:'testDialog',focus:'first'});
  assert.equal(result.wrapped,'first');assert.equal(result.restored,'launch');
  assert.equal(result.hiddenAncestor,'');assert.equal(result.visibleAncestor,'testDialog');assert.equal(result.removed,'');
} finally { await browser.close(); await server.close(); }

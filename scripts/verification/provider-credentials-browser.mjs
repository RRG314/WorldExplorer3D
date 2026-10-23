import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';

const out='output/verification/provider-credentials';
await fs.mkdir(out,{recursive:true});
const html=await fs.readFile('app/index.html','utf8');
const server=await startStaticServer({rootDir:process.cwd(),ports:[0]});
let owned;
const errors=[],checks=[];
try {
  owned=await chromium.launchServer({headless:true,...(process.env.CI?{}:{channel:'chrome'})});
  const browser=await chromium.connect(owned.wsEndpoint());
  const page=await browser.newPage({viewport:{width:460,height:900}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.port}/404.html`);
  await page.evaluate(()=>{
    localStorage.setItem('attomApiKey','synthetic-legacy-attom');
    localStorage.setItem('rentcastApiKey','synthetic-legacy-rentcast');
    localStorage.setItem('we3d.security-fixture.player','preserve');
  });
  const mount=async()=>page.evaluate(async html=>{
    // Trusted application markup, isolated to the actual Settings component.
    const doc=new DOMParser().parseFromString(html,'text/html');
    for(const node of doc.querySelectorAll('script, link[href^="https:"]'))node.remove();
    const base=document.createElement('base');base.href='/app/';
    document.head.replaceChildren(base,...Array.from(doc.head.childNodes).map(n=>document.importNode(n,true)));
    const menu=doc.querySelector('.menu-container');
    for(const node of menu.querySelectorAll('.tab-content:not(#tab-settings),.tab-nav'))node.remove();
    const settings=menu.querySelector('#tab-settings');settings.classList.add('active');
    document.body.replaceChildren(document.importNode(menu,true));
    document.body.style.cssText='margin:0;padding:16px;display:grid;place-items:start center;overflow:auto;min-height:100vh';
    document.querySelector('.menu-container').style.cssText='max-height:none;width:100%;max-width:600px;margin:0';
    const {ctx}=await import('/app/js/shared-context.js?v=55');
    const {apiConfig,PropertyAPI}=await import('/app/js/real-estate.js');
    const {setupSettingsUi}=await import('/app/js/ui/settings.js');
    setupSettingsUi(ctx);
    window.securityProviderOwner=ctx;window.securityPropertyApi=PropertyAPI;
    window.render_game_to_text=()=>JSON.stringify({ownerReused:ctx.apiConfig===apiConfig,attom:!!apiConfig.attom,rentcast:!!apiConfig.rentcast,estated:!!apiConfig.estated,legacyStored:['attomApiKey','rentcastApiKey','estatedApiKey'].some(k=>localStorage.getItem(k)!==null),playerMarker:localStorage.getItem('we3d.security-fixture.player')});
    return JSON.parse(render_game_to_text());
  },html);
  let state=await mount();assert.equal(state.ownerReused,true);assert.equal(state.attom,true);assert.equal(state.rentcast,true);assert.equal(state.legacyStored,false);assert.equal(state.playerMarker,'preserve');checks.push('legacy migration preserves the existing provider owner and unrelated storage');
  await page.locator('#attomKeyInput').fill('synthetic-visit-attom');
  await page.locator('#rentcastKeyInput').fill('synthetic-visit-rentcast');
  await page.locator('#saveApiKey').click();
  state=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.equal(state.attom,true);assert.equal(state.rentcast,true);assert.equal(state.legacyStored,false);checks.push('normal Settings input retains private keys only for this visit');
  // Exercise the unchanged provider reader without sending a key or request externally.
  const reader=await page.evaluate(async()=>{
    const original=window.fetch;let called=false,correctOwner=false;
    window.fetch=async(url,options)=>{called=true;correctOwner=options.headers.apikey===securityProviderOwner.apiConfig.attom;return new Response('{"property":[]}',{headers:{'Content-Type':'application/json'}});};
    try{await securityPropertyApi.fetchATTOM(1,2);return {called,correctOwner};}finally{window.fetch=original;}
  });assert.deepEqual(reader,{called:true,correctOwner:true});checks.push('property provider reads the same in-memory credential');
  await page.locator('#saveApiKey').scrollIntoViewIfNeeded();
  await page.screenshot({path:out+'/settings.png'});
  await page.reload();state=await mount();assert.equal(state.attom,false);assert.equal(state.rentcast,false);assert.equal(state.legacyStored,false);assert.equal(state.playerMarker,'preserve');checks.push('reload clears keys and preserves unrelated player storage');
  await page.locator('#attomKeyInput').fill('synthetic-clear-attom');await page.locator('#saveApiKey').click();await page.locator('#attomKeyInput').fill('');await page.locator('#saveApiKey').click();state=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.equal(state.attom,false);checks.push('clearing the existing input releases its credential');
  assert.deepEqual(errors,[]);
  await fs.writeFile(out+'/report.json',JSON.stringify({passed:true,checks,errors,state,scope:'Actual Settings markup and module, existing provider owner and reader; synthetic keys, no live provider or player data'},null,2));
  console.log(JSON.stringify({passed:true,checks:checks.length,errors:errors.length}));
} finally {if(owned)await closeOwnedBrowser(owned);await server.close();}

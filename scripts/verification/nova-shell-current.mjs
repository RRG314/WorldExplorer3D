import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';

const root = process.cwd();
const base = process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192';
const output = path.resolve(process.env.WE3D_NOVA_OUTPUT || `output/verification/nova-ui-20261104/shell-${Date.now()}`);
const selected = new Set((process.env.WE3D_NOVA_CASES || '').split(',').filter(Boolean));
const report = {scope:'Actual source selector and native workspaces. No gameplay procedure, online command, email submission or production change.',cases:[],screens:[],errors:[]};
let qa;

async function capture(page, name, scope='body') {
  const file = name+'.png';
  await page.screenshot({path:path.join(output,file)});
  const controls = await page.locator(scope).evaluate(root => [...root.querySelectorAll('button,a[href],input,select,textarea,summary,[role="button"]')].filter(e=>{
    const r=e.getBoundingClientRect(),s=getComputedStyle(e);
    return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';
  }).map(e=>{
    const r=e.getBoundingClientRect();
    const label=e.getAttribute('aria-label')||e.getAttribute('title')||[...(e.labels||[])].map(l=>l.textContent).join(' ')||e.textContent||e.getAttribute('placeholder')||'';
    const inViewport=r.x>=0&&r.y>=0&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5;
    const hit=inViewport?e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)):null;
    return {id:e.id,tag:e.tagName,role:e.getAttribute('role'),label:label.trim().replace(/\s+/g,' ').slice(0,180),disabled:!!e.disabled,expanded:e.getAttribute('aria-expanded'),pressed:e.getAttribute('aria-pressed'),inViewport,centerExposed:hit,width:r.width,height:r.height};
  }));
  const unnamed=controls.filter(c=>!c.label&&!['INPUT','TEXTAREA'].includes(c.tag));
  assert.deepEqual(unnamed,[],name+' controls have visible or accessible labels');
  report.screens.push({name,file,controls});
}

async function run(name, callback) {
  if(selected.size&&!selected.has(name))return;
  await callback();report.cases.push({name,ok:true});
}

try {
  qa=await createFieldworkQaSession({rootDir:root,output,careerId:'explorer',maximumDurationMs:5*60*1000});
  const {page}=qa;
  await page.setViewportSize({width:1440,height:960});
  await page.goto(base+'/app/?diagnostics=1');
  await page.locator('#globeSelectorStartBtn').waitFor({state:'visible'});
  await run('desktop-globe',async()=>{
    assert.equal(await page.locator('.globe-app-rail button').count(),5);
    const box=await page.locator('.globe-selector-stage').boundingBox();
    assert.ok(box.width>600&&box.height>400,'the globe retains a usable scene');
    assert.equal(await page.locator('html').evaluate(e=>getComputedStyle(e).getPropertyValue('--wx-action').trim()),'#d1b6ff');
    await page.locator('#globeSelectorMapBasemapBtn').click();
    assert.equal(await page.locator('#globeSelectorMapBasemapBtn').getAttribute('aria-pressed'),'true');
    await page.locator('#globeSelectorSatelliteBasemapBtn').click();
    assert.equal(await page.locator('#globeSelectorSatelliteBasemapBtn').getAttribute('aria-pressed'),'true');
    await page.locator('#globeSelectorZoomInBtn').click();
    await page.locator('#globeSelectorZoomOutBtn').click();
    await capture(page,'desktop-globe','#globeSelectorScreen');
  });
  await run('create',async()=>{
    await page.locator('.globe-app-rail [data-globe-destination="create"]').click();
    await page.locator('#novaCreateHub').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-create-start]').count(),2);
    assert.equal(await page.locator('#novaCreateHub a').count(),2);
    await capture(page,'create','#globeHubOverlay');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#globeHubOverlay').isVisible(),false);
    await page.locator('.globe-app-rail [data-globe-destination="create"]').click();
    await page.keyboard.press('Escape');
    await page.locator('[data-globe-destination="settings"]').click();
    assert.equal(await page.locator('#novaCreateHub').isVisible(),false,'Create does not remain under Settings');
    await page.keyboard.press('Escape');
  });
  await run('activities',async()=>{
    await page.locator('.globe-app-rail [data-globe-destination="games"]').click();
    await page.locator('#experienceBrowser').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-experience-id]').count(),20);
    for(const [group,count] of Object.entries({land:6,water:4,space:3,motion:2,create:5,all:20})) {
      await page.locator(`[data-experience-group="${group}"]`).click();
      assert.equal(await page.locator('[data-experience-id]').count(),count,group+' retains every assigned career');
    }
    await capture(page,'activities','#experienceBrowser');
    await page.locator('#experienceBrowser input[type="search"]').fill('Archaeologist');
    await page.locator('[data-experience-id="career:archaeologist"]').click();
    await page.locator('.experience-detail h3').waitFor({state:'visible'});
    await capture(page,'career-brief','#experienceBrowser');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#experienceBrowser').isVisible(),false);
  });
  await run('workspace-navigation',async()=>{
    await page.locator('.globe-app-rail [data-globe-destination="games"]').click();
    await page.locator('#experienceBrowser').waitFor({state:'visible'});
    assert.equal(await page.locator('#experienceBrowser .nova-workspace-navigation button').count(),5);
    await page.locator('#experienceBrowser [data-nova-section="journal"]').click();
    await page.locator('#discoveryPanel').waitFor({state:'visible'});
    assert.equal(await page.locator('#experienceBrowser').isVisible(),false);
    await capture(page,'workspace-journal','#discoveryPanel');
    await page.locator('#discoveryPanel [data-nova-section="create"]').click();
    await page.locator('#novaCreateHub').waitFor({state:'visible'});
    assert.equal(await page.locator('#discoveryPanel').isVisible(),false);
    await capture(page,'workspace-create','#globeHubOverlay');
    await page.locator('#globeHubOverlay [data-nova-section="together"]').click();
    await page.locator('#tab-multiplayer').waitFor({state:'visible'});
    await page.locator('#globeHubOverlay [data-nova-section="explore"]').click();
    assert.equal(await page.locator('#globeHubOverlay').isVisible(),false);
    await page.locator('.globe-app-rail [data-globe-destination="games"]').click();
    await page.locator('#experienceBrowser').waitFor({state:'visible'});
    await page.locator('#experienceBrowser .nova-workspace-navigation button').first().focus();
    for(let i=0;i<8;i++)await page.keyboard.press('Tab');
    assert.equal(await page.locator('#experienceBrowser').evaluate(e=>e.contains(document.activeElement)),true);
    // Controlled UI busy state only; no transaction or progression claim.
    await page.locator('#experienceBrowser').evaluate(e=>e.setAttribute('aria-busy','true'));
    await page.locator('#experienceBrowser [data-nova-section="journal"]').click();
    assert.equal(await page.locator('#experienceBrowser').isVisible(),true);
    assert.equal(await page.locator('#discoveryPanel').isVisible(),false);
    await page.locator('#experienceBrowser').evaluate(e=>e.setAttribute('aria-busy','false'));
    await page.locator('[data-experience-close]').click();
  });
  await run('workspace-layout',async()=>{
    const views=[['games','#experienceBrowser','[data-experience-close]'],['journal','#discoveryPanel','#discoveryCloseBtn'],['create','#globeHubOverlay','#globeHubOverlayCloseBtn'],['multiplayer','#globeHubOverlay','#globeHubOverlayCloseBtn']];
    for(const [width,height] of [[1440,960],[390,844],[844,390]])for(const scale of ['100','200']){
      await page.setViewportSize({width,height});
      await page.locator('[data-globe-destination="settings"]').click();
      await page.locator('#accessibilityTextScale').selectOption(scale);await page.keyboard.press('Escape');
      for(const [view,selector,close] of views){
        await page.locator(`.globe-app-rail [data-globe-destination="${view}"]`).click();
        const root=page.locator(selector);await root.waitFor({state:'visible'});
        const bounds=await root.boundingBox();assert.ok(bounds.x>=-.5&&bounds.y>=-.5&&bounds.x+bounds.width<=width+.5&&bounds.y+bounds.height<=height+.5,'workspace stays in viewport');
        const buttons=root.locator('.nova-workspace-navigation button');assert.equal(await buttons.count(),5);
        for(let i=0;i<5;i++){
          const button=buttons.nth(i);await button.scrollIntoViewIfNeeded();
          const valid=await button.evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.x>=-.5&&r.right<=innerWidth+.5&&r.y>=-.5&&r.bottom<=innerHeight+.5&&e.scrollWidth<=e.clientWidth+1&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
          assert.ok(valid,`${view} navigation target ${i} fits at ${width}/${scale}`);
        }
        await capture(page,`workspace-${view}-${width}-${scale}`,selector);
        await page.locator(close).click();
      }
    }
  });
  await run('appearance',async()=>{
    await page.locator('#globeHubThemeBtn').click();
    await capture(page,'day-globe','#globeSelectorScreen');
    await page.locator('.globe-app-rail [data-globe-destination="create"]').click();await capture(page,'day-create','#globeHubOverlay');await page.keyboard.press('Escape');
    await page.setViewportSize({width:390,height:844});await page.locator('.globe-selector-side').evaluate(e=>e.scrollTo(0,0));await capture(page,'day-phone','#globeSelectorScreen');
    await page.locator('#globeHubThemeBtn').click();await page.setViewportSize({width:1440,height:960});
  });
  await run('journal',async()=>{
    await page.locator('.globe-app-rail [data-globe-destination="journal"]').click();
    await page.locator('#discoveryPanel').waitFor({state:'visible'});
    await capture(page,'journal','#discoveryPanel');
    await page.locator('#discoveryCloseBtn').click();
    assert.equal(await page.locator('#discoveryPanel').isVisible(),false);
  });
  await run('together',async()=>{
    await page.locator('.globe-app-rail [data-globe-destination="multiplayer"]').click();
    await page.locator('#tab-multiplayer').waitFor({state:'visible'});
    await capture(page,'together','#globeHubOverlay');
    await page.keyboard.press('Escape');
  });
  await run('settings-controls',async()=>{
    await page.locator('[data-globe-destination="settings"]').click();
    await page.locator('#tab-settings').waitFor({state:'visible'});
    await capture(page,'settings','#globeHubOverlay');
    await page.keyboard.press('Escape');
    await page.locator('.globe-hub-tools [data-globe-destination="controls"]').click();
    await page.locator('#tab-controls').waitFor({state:'visible'});
    await capture(page,'controls','#globeHubOverlay');
    await page.keyboard.press('Escape');
  });
  await run('phone',async()=>{
    await page.setViewportSize({width:390,height:844});
    await page.locator('.globe-selector-side').evaluate(e=>e.scrollTo(0,0));
    await capture(page,'phone-globe','#globeSelectorScreen');
    await page.locator('.globe-app-rail [data-globe-destination="create"]').click();
    await capture(page,'phone-create','#globeHubOverlay');
    await page.keyboard.press('Escape');
    await page.locator('.globe-app-rail [data-globe-destination="games"]').click();
    await capture(page,'phone-activities','#experienceBrowser');
    await page.keyboard.press('Escape');
  });
  assert.deepEqual(qa.report.errors,[]);
  report.providerErrors=qa.report.providerErrors;
  report.ok=true;
} catch(error) {
  report.ok=false;report.failure=error.stack;
  await qa?.fail(error);
} finally {
  await qa?.close();
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({ok:report.ok,output,cases:report.cases,failure:report.failure}));
if(!report.ok)process.exitCode=1;

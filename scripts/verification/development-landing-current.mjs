import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const out='output/facilities-20261011/landing';await mkdir(out,{recursive:true});
const report={ok:false,scope:'Local landing page with current development-preview captures. No new public deployment.',cases:[],errors:[]};
let server,browser,page;const check=(name,pass)=>{report.cases.push({name,passed:!!pass});assert.ok(pass,name);};
try {
  const gallery=JSON.parse(await readFile('config/development-gallery.json','utf8'));
  check('gallery is explicitly unreleased with a source receipt',gallery.stage==='local-development'&&!!gallery.sourceFingerprint.workspaceFingerprint);
  for(const image of gallery.images){const bytes=await readFile(image.file);check(`${image.id} bytes match their capture receipt`,createHash('sha256').update(bytes).digest('hex')===image.sha256);}
  server=await startStaticServer({rootDir:process.cwd(),ports:[4398]});browser=await chromium.launch({channel:'chrome',headless:false});
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.port}/`);const section=page.locator('#research-preview');await section.scrollIntoViewIfNeeded();
  check('preview label distinguishes this work from the released gallery',await section.innerText().then(t=>/Next update/i.test(t)&&t.includes('development build')));
  await section.locator('summary').click();
  for(const image of await section.locator('img').all()) {
    await image.scrollIntoViewIfNeeded();await image.evaluate(img=>img.decode());
    assert.equal(await image.evaluate(i=>i.naturalWidth),1600);assert.equal(await image.evaluate(i=>i.naturalHeight),900);
  }
  check('all four current gameplay images decode at the captured size',await section.locator('img').count()===4);
  await section.evaluate(s=>window.scrollTo({top:s.offsetTop-76,behavior:'instant'}));
  await page.screenshot({path:`${out}/desktop-preview.png`});
  check('desktop page fits horizontally',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:390,height:844});await section.evaluate(s=>window.scrollTo({top:s.offsetTop-64,behavior:'instant'}));await page.screenshot({path:`${out}/phone-preview.png`});
  check('phone page and images fit horizontally',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('phone preview text and cards stay within the section',await section.evaluate(s=>{const b=s.getBoundingClientRect();return [...s.querySelectorAll('h2,p,figure')].every(e=>{const r=e.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1&&e.scrollWidth<=e.clientWidth+1;});}));
  await section.locator('summary').focus();await page.keyboard.press('Enter');check('keyboard can close the additional views',!await section.locator('details').evaluate(d=>d.open));
  check('no page errors',report.errors.length===0);report.ok=true;
} catch(error){report.failure=String(error.stack||error);process.exitCode=1;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server?.close();}
console.log(JSON.stringify(report));

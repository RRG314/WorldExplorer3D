import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';

const output='output/verification/public-gallery';
await fs.mkdir(output,{recursive:true});
const gallery=JSON.parse(await fs.readFile('config/public-gallery.json','utf8'));
const server=await startStaticServer({rootDir:process.cwd(),ports:[4463]});
const owned=await chromium.launchServer({channel:'chrome',headless:false});
const browser=await chromium.connect(owned.wsEndpoint());
const report={passed:false,cases:[],pageErrors:[]};
try {
  const page=await browser.newPage();
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  for(const [name,url] of [['landing','/'],['pages','/output/verification/public-gallery/pages/']]) {
    await page.goto(`http://127.0.0.1:${server.port}${url}`,{waitUntil:'domcontentloaded'});
    for(const [layout,width,height] of [['desktop',1440,1000],['tablet',800,900],['phone',390,844]]) {
      await page.setViewportSize({width,height});
      const images=await page.locator('img[data-gallery]').evaluateAll(async nodes=>{
        await Promise.all(nodes.map(node=>{node.loading='eager';return node.decode();}));
        return nodes.map(node=>({id:node.dataset.gallery,src:node.getAttribute('src'),alt:node.alt,width:node.naturalWidth,height:node.naturalHeight,displayWidth:node.getBoundingClientRect().width,displayHeight:node.getBoundingClientRect().height}));
      });
      for(const image of images) {
        const expected=gallery.images.find(item=>item.id===image.id);
        assert.ok(expected,`Unregistered image ${image.id}`);
        assert.equal(image.src,expected.file);assert.equal(image.alt,expected.alt);
        assert.equal(image.width,expected.width);assert.equal(image.height,expected.height);
        assert.ok(Math.abs(image.displayWidth/image.displayHeight-image.width/image.height)<.025,`${name}/${layout}/${image.id} distorts or crops the screenshot`);
      }
      assert.ok(images.length>=10,`${name} is missing the expanded gallery`);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
      assert.ok(overflow<=1,`${name}/${layout} overflows by ${overflow}px`);
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:`${output}/${name}-${layout}.png`});
      await page.locator(name==='landing'?'.gallery figure':'.showcase-card').first().scrollIntoViewIfNeeded();
      await page.screenshot({path:`${output}/${name}-${layout}-gallery.png`});
      report.cases.push({surface:name,layout,images:images.length,overflow,passed:true});
    }
  }
  assert.deepEqual(report.pageErrors,[]);report.passed=true;
} catch(error) {report.failure=String(error.stack||error);process.exitCode=1;}
finally {await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');await closeOwnedBrowser(owned);await server.close();}
console.log(JSON.stringify(report));

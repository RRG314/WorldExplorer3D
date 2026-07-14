import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const host = '127.0.0.1';
const server = await startStaticRootServer({
  rootDir,
  host,
  candidatePorts: [4210, 4211, 4212]
});
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 480 } });
  await page.goto(`http://${host}:${server.port}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const result = await page.evaluate(() => {
    const controls = document.getElementById('controlsTab');
    const controlsStyle = controls ? getComputedStyle(controls) : null;
    const localSheets = Array.from(document.styleSheets).filter((sheet) =>
      String(sheet.href || '').includes('/app/styles/')
    );
    return {
      controls: controlsStyle ? {
        bottom: controlsStyle.bottom,
        left: controlsStyle.left,
        maxWidth: controlsStyle.maxWidth,
        position: controlsStyle.position,
        width: controlsStyle.width,
        zIndex: controlsStyle.zIndex
      } : null,
      sheets: localSheets.map((sheet) => ({
        href: sheet.href,
        ruleCount: sheet.cssRules.length
      }))
    };
  });

  const requiredStyles = ['title-shell.css', 'runtime-shell.css', 'block-builder.css'];
  const missingStyles = requiredStyles.filter((name) =>
    !result.sheets.some((sheet) => String(sheet.href || '').includes(`/${name}`))
  );
  if (missingStyles.length > 0 || result.sheets.some((sheet) => sheet.ruleCount < 1)) {
    throw new Error(`App stylesheets did not parse: ${JSON.stringify(result.sheets)}`);
  }
  if (
    !result.controls ||
    result.controls.position !== 'fixed' ||
    result.controls.bottom === 'auto' ||
    Number.parseFloat(result.controls.width) > 300 ||
    Number(result.controls.zIndex) < 100
  ) {
    throw new Error(`Runtime controls lost their shell styling: ${JSON.stringify(result.controls)}`);
  }

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} finally {
  await browser.close();
  await server.close();
}

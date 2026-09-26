import { setTimeout as delay } from 'node:timers/promises';

// Playwright's waitForFunction polls a synchronous predicate. A Promise is truthy
// even when it eventually resolves false; await each evaluation before deciding.
export async function waitForAsyncCondition(page, predicate, arg, options = {}) {
  const timeout = options.timeout ?? 30000;
  if (!(timeout > 0)) throw new Error('Async browser conditions require a finite deadline.');
  const polling = typeof options.polling === 'number' ? options.polling : 100;
  let timer, expired = false;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new Error(`Async browser condition timed out after ${timeout} ms`));
    }, timeout);
  });
  const poll = async () => {
    while (!expired) {
      const result = await page.evaluate(predicate, arg);
      if (expired) return;
      if (result) return result;
      await delay(polling);
    }
  };
  try { return await Promise.race([poll(), deadline]); }
  finally { expired = true; clearTimeout(timer); }
}

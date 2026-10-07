// Fresh Ocean entry now starts aboard. Existing underwater checks must walk
// to the cradle and deploy through the actual controls before testing the sub.
export async function deployResearchSubmarineFromDeck(page) {
  await page.evaluate(async()=>{globalThis.__marineEntryContext=(await import('/app/js/shared-context.js?v=55')).ctx;});
  await page.waitForFunction(()=>!__marineEntryContext.titleLaunchPending &&
    (__marineEntryContext.boatDeck?.active || __marineEntryContext.oceanMode?.active),null,{timeout:120000});
  if(await page.evaluate(()=>!!__marineEntryContext.oceanMode?.active))return;
  await page.getByLabel('Deck destination').selectOption('sub');
  const moveUntil=async(key,predicate)=>{
    await page.keyboard.down(key);
    try{await page.waitForFunction(predicate,null,{timeout:12000});}
    finally{await page.keyboard.up(key);}
  };
  await moveUntil('KeyD',()=>__marineEntryContext.boatDeck.snapshot().pose.x<.6);
  await moveUntil('KeyS',()=>__marineEntryContext.boatDeck.snapshot().pose.z< -25.5);
  await page.locator('#researchDeckAction').click();
  await page.waitForFunction(()=>__marineEntryContext.oceanMode?.active &&
    !__marineEntryContext.oceanMode.diver?.active,null,{timeout:60000});
}

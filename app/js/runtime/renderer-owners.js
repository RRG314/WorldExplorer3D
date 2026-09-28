// Presentation ownership only; does not change or dispose renderer resources.
export function rendererOwnershipSnapshot(context, snapshot) {
  const owners={main:context.renderer||null,ocean:context.oceanMode?.renderer||null,space:context.spaceFlight?.renderer||null};
  const activeOwner=context.spaceFlight?.active?'space':context.oceanMode?.active?'ocean':context.gameStarted?'main':null;
  const values=new Map();
  const byOwner={};
  for(const [owner,renderer] of Object.entries(owners)){
    if(renderer&&!values.has(renderer))values.set(renderer,snapshot(renderer));
    byOwner[owner]=renderer?values.get(renderer):null;
  }
  return {activeOwner,active:activeOwner?byOwner[activeOwner]:null,...byOwner};
}

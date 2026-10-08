// Presentation ownership only; does not change or dispose renderer resources.
export function activePresentationOwner(context) {
  if(context.spaceFlight?.active)return 'space';
  if(context.oceanMode?.active)return 'ocean';
  return context.gameStarted?'main':null;
}

export function capturePresentation(context) {
  const owner=activePresentationOwner(context),source=owner==='main'?context:owner==='space'?context.spaceFlight:context.oceanMode;
  const renderer=source?.renderer,scene=source?.scene,camera=source?.camera;
  return Object.freeze({owner,renderer,scene,camera,
    isCurrent:()=>activePresentationOwner(context)===owner&&source?.renderer===renderer&&source?.scene===scene&&source?.camera===camera});
}

export function rendererOwnershipSnapshot(context, snapshot) {
  const owners={main:context.renderer||null,ocean:context.oceanMode?.renderer||null,space:context.spaceFlight?.renderer||null};
  const activeOwner=activePresentationOwner(context);
  const values=new Map();
  const byOwner={};
  for(const [owner,renderer] of Object.entries(owners)){
    if(renderer&&!values.has(renderer))values.set(renderer,snapshot(renderer));
    byOwner[owner]=renderer?values.get(renderer):null;
  }
  return {activeOwner,active:activeOwner?byOwner[activeOwner]:null,...byOwner};
}

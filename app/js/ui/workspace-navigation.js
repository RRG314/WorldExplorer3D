import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';

const sections=Object.freeze([
  {id:'explore',label:'Explore',symbol:'◎',target:'exploreBtn',globe:'location'},
  {id:'activities',label:'Activities',symbol:'⌖',target:'fActivities',globe:'games'},
  {id:'journal',label:'Journal',symbol:'▤',target:'fExplorerJournal',globe:'journal'},
  {id:'create',label:'Create',symbol:'◇',target:'realEstateFloatBtn',globe:'create'},
  {id:'together',label:'Together',symbol:'♙',target:'communityBtn',globe:'multiplayer'},
]);
const workspaces=Object.freeze([
  {id:'experienceBrowser',section:'activities',close:'[data-experience-close]'},
  {id:'discoveryPanel',section:'journal',close:'#discoveryCloseBtn'},
  {id:'urbanEquipment',section:'kit',close:'#urbanEquipmentCloseBtn',slot:'.urbanEquipmentHead'},
  {id:'globeHubOverlay',section:'hub',close:'#globeHubOverlayCloseBtn',slot:'.globe-hub-overlay-header'},
]);
const contextPanels=Object.freeze([
  {id:'blockBuilderPanel',close:'#blockBuilderClose'},
  {id:'propertyPanel',close:'#closePropertyPanelBtn'},
  {id:'historicPanel',close:'#closeHistoricPanelBtn'},
  {id:'universeNavigator',close:'#universeCloseBtn',toggle:'universeToggle'},
  {id:'expeditionOverlay',close:'#expeditionClose'},
]);
let currentBinding;

// One presentation component, used in play and primary workspaces. Every
// destination still invokes its original controller and closing action.
export function bindWorkspaceNavigation(documentRef=globalThis.document,{onBlocked=()=>{},resolveExploreTarget=()=>null}={}) {
  currentBinding?.dispose();
  const scope=createLifecycleScope('workspace-navigation');
  const mounted=[];
  for(const definition of workspaces){
    const root=documentRef.getElementById(definition.id);if(!root)continue;
    const nav=documentRef.createElement('nav');nav.className='explorer-workspace-navigation';nav.setAttribute('aria-label','Main sections');
    nav.innerHTML=sections.map(section=>`<button type="button" data-explorer-target="${section.target}" data-explorer-section="${section.id}"><span aria-hidden="true">${section.symbol}</span>${section.label}</button>`).join('');
    (definition.slot?root.querySelector(definition.slot):root)?.prepend(nav);
    root.classList.add('explorer-workspace-host');root.dataset.explorerWorkspace=definition.section;
    mounted.push({...definition,root,nav});
    scope.defer(()=>{nav.remove();root.classList.remove('explorer-workspace-host');delete root.dataset.explorerWorkspace;});
  }
  const visible=node=>!!node&&node.isConnected&&!node.hidden&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0;
  function activeWorkspace(){
    return mounted.find(item=>item.root.matches('dialog:modal')&&visible(item.root))||mounted.find(item=>visible(item.root))||null;
  }
  function sectionFor(workspace){
    if(workspace?.section!=='hub')return workspace?.section||'';
    const destination=documentRef.querySelector('.globe-app-rail button.active')?.dataset.globeDestination;
    return sections.find(section=>section.globe===destination)?.id||'';
  }
  function closeWorkspace(workspace){
    if(!workspace)return true;
    const close=workspace.root.querySelector(workspace.close);
    if(workspace.root.getAttribute('aria-busy')==='true'||close?.disabled){onBlocked('Wait for the current action to finish before switching sections.');return false;}
    close?.click();
    if(visible(workspace.root)){onBlocked('Finish or close the current action before switching sections.');return false;}
    return true;
  }
  function closeContextPanels(targetId=''){
    for(const definition of contextPanels){const root=documentRef.getElementById(definition.id);if(visible(root)&&definition.toggle!==targetId&&!closeWorkspace({...definition,root}))return false;}
    return true;
  }
  function targetFor(button){
    const section=sections.find(item=>item.target===button.dataset.explorerTarget);
    if(section&&documentRef.body?.classList.contains('start-hub-open'))return documentRef.querySelector(`.globe-app-rail [data-globe-destination="${section.globe}"]`);
    if(section?.id==='explore'){const contextual=resolveExploreTarget();if(contextual)return documentRef.getElementById(contextual);}
    return documentRef.getElementById(button.dataset.explorerTarget);
  }
  function reflect(){
    const layer=documentRef.body?.dataset.gamePanelLayer;
    for(const button of documentRef.querySelectorAll('[data-explorer-target]')){
      const target=targetFor(button);button.disabled=!target||!!target.disabled||target.getAttribute('aria-disabled')==='true';
      const expanded=target?.getAttribute('aria-expanded');if(expanded!==null&&expanded!==undefined)button.setAttribute('aria-expanded',expanded);
      const controls=target?.getAttribute('aria-controls');if(controls)button.setAttribute('aria-controls',controls);
      if(button.dataset.explorerTarget==='fActivities'){button.setAttribute('aria-controls','experienceBrowser');button.setAttribute('aria-expanded',String(layer==='experiences'));}
      if(button.dataset.explorerTarget==='fExplorerJournal'){button.setAttribute('aria-controls','discoveryPanel');button.setAttribute('aria-expanded',String(layer==='journal'));}
      const workspace=mounted.find(item=>item.root.contains(button));
      if(workspace&&button.dataset.explorerSection===sectionFor(workspace))button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    }
  }
  // Capturing only workspace intents avoids a second click reaching the world's
  // outside-menu handler after its original action has opened a new menu.
  scope.listen(documentRef,'click',event=>{
    const element=event.target?.closest?.('[data-explorer-target],#mainMenuBtn');if(!element)return;
    const workspace=activeWorkspace();
    if(element.id==='mainMenuBtn'){
      if(!closeWorkspace(workspace)||!closeContextPanels()){event.preventDefault();event.stopImmediatePropagation();}return;
    }
    event.preventDefault();event.stopPropagation();
    const section=sections.find(item=>item.target===element.dataset.explorerTarget);
    if(workspace&&sectionFor(workspace)===section?.id)return;
    if(!closeWorkspace(workspace))return;
    const target=targetFor(element);
    if(!closeContextPanels(target?.id))return;
    if(target&&!target.disabled&&target.getAttribute('aria-disabled')!=='true')target.click();
    queueMicrotask(reflect);
  },true);
  const originals=new Set([...documentRef.querySelectorAll('[data-explorer-target]')].map(button=>documentRef.getElementById(button.dataset.explorerTarget)).filter(Boolean));
  if(globalThis.MutationObserver)for(const target of originals){
    const observer=new MutationObserver(reflect);observer.observe(target,{attributes:true,attributeFilter:['aria-expanded','aria-controls','disabled','aria-disabled']});scope.defer(()=>observer.disconnect());
  }
  if(documentRef.body&&globalThis.MutationObserver){const observer=new MutationObserver(reflect);observer.observe(documentRef.body,{attributes:true,attributeFilter:['class']});scope.defer(()=>observer.disconnect());}
  const rail=documentRef.querySelector('.globe-app-rail');
  if(rail&&globalThis.MutationObserver){const observer=new MutationObserver(reflect);observer.observe(rail,{subtree:true,attributes:true,attributeFilter:['class']});scope.defer(()=>observer.disconnect());}
  scope.listen(globalThis,'we3d-screen-layout-change',reflect);
  scope.listen(globalThis,'pagehide',event=>{if(!event.persisted)scope.dispose('page closed');});
  reflect();
  currentBinding=Object.freeze({dispose:()=>scope.dispose('navigation released')});return currentBinding;
}

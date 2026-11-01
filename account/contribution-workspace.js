import {observeAuth,getCurrentUser} from '../js/auth-ui.js?v=56';
import {mountReviewWorkspace,mountContributionWorkspace} from '../app/js/reality-capture/review-workspace.js';
let dispose=()=>{},mounted='',generation=0;
function update(){
  const url=new URL(location.href),section=url.searchParams.get('section')||'overview',content=url.searchParams.get('content')==='racing'?'racing':'buildings',user=getCurrentUser(),key=`${user?.uid||''}:${section}:${content}`;
  if(key===mounted)return;generation++;dispose();dispose=()=>{};mounted=key;
  if(!user||user.isAnonymous)return;
  if(section==='social'){
   const host=document.querySelector('[data-account-racing-host]'),token=generation;if(!host)return;host.textContent='Loading racing progress…';
   const current=()=>generation===token&&getCurrentUser()?.uid===user.uid;
   void import('../app/js/racing/career-workspace.js').then(({mountRacingCareer})=>{if(current()){const view=mountRacingCareer(host,{ownerUid:user.uid,isCurrent:current});dispose=()=>view.dispose();}}).catch(()=>{if(current())host.textContent='Racing progress could not open. Try returning to this tab.';});return;
  }
  if(!['review','contributions'].includes(section))return;
  const host=document.querySelector(`[data-account-view="${section}"] [data-contribution-workspace]`);if(!host)return;
  const token=generation,nav=document.createElement('nav');nav.setAttribute('aria-label',section==='review'?'Review category':'Contribution category');
  for(const [id,label]of [['buildings','Buildings'],['racing','Racing routes']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(content===id));b.onclick=()=>{const next=new URL(location.href);next.searchParams.set('content',id);history.replaceState(null,'',next);update();};nav.append(b);}
  const panel=document.createElement('div');host.replaceChildren(nav,panel);
  if(content==='racing'){const current=()=>generation===token&&getCurrentUser()?.uid===user.uid;panel.textContent='Loading racing routes…';
   void import('../app/js/racing/review-workspace.js').then(({mountRacingWorkspace})=>{if(current())dispose=mountRacingWorkspace(panel,{ownerUid:user.uid,review:section==='review',isCurrent:current});}).catch(()=>{if(current())panel.textContent='Racing routes could not open. Select Buildings, then try Racing routes again.';});return;}
  const onEdit=async id=>{const {openRealityCaptureSession}=await import('../app/js/reality-capture/ui.js?v=2');await openRealityCaptureSession(id);};
  if(section==='review')dispose=mountReviewWorkspace(panel,{captureId:new URL(location.href).searchParams.get('capture')||'',onEdit});
  if(section==='contributions')dispose=mountContributionWorkspace(panel,{onEdit});
}
window.addEventListener('we3d:account-section',update);window.addEventListener('popstate',update);observeAuth(update);update();

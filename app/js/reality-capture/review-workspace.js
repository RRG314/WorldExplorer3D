import './capture-theme.js';
import {layoutEntrance} from '../../../functions/interior-layout.mjs';
import {listRealityCaptureModeration,getRealityCaptureModerationDetail,moderateRealityCapture,listMyRealityCaptures} from '../../../js/community-reality-capture-api.js?v=4';
import {captureLabel,captureWorkflow} from './workflow-presentation.js';
import {createCaptureViewer} from './result-viewer.js?v=1';

export function captureWorldUrl(building){
  const url=new URL('/app/',location.href);url.search=new URLSearchParams({loc:'custom',lat:String(building.lat),lon:String(building.lon),lname:building.label||'My building',launch:'earth',mode:'walk'});return url.href;
}
const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;return b;};
const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};

// One review component for account and in-world workflows. All permissions and
// revision checks stay in the existing server endpoints.
export function mountReviewWorkspace(host,{captureId='',onOpenWorld,onEdit,api={listRealityCaptureModeration,getRealityCaptureModerationDetail,moderateRealityCapture}}={}){
  const controller=new AbortController();let request=0,viewer=null,disposed=false,busy=false,current=null;
  host.classList.add('captureReviewWorkspace');
  host.innerHTML='<style>.captureReviewWorkspace nav{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.captureReviewWorkspace button,.captureReviewWorkspace select,.captureReviewWorkspace textarea{font:inherit;min-height:44px;background:#101921;color:inherit;border:1px solid #53606a;padding:8px;border-radius:4px}.captureReviewWorkspace button{cursor:pointer}.captureReviewWorkspace button:disabled{opacity:.5}.captureReviewWorkspace [data-review-grid]{display:grid;grid-template-columns:minmax(200px,1fr) minmax(0,2fr);gap:16px}.captureReviewWorkspace [data-review-list] button{display:block;width:100%;text-align:left;margin-bottom:8px}.captureReviewWorkspace [aria-current=true]{border:2px solid #2d7dff}.captureReviewWorkspace [data-review-preview]{min-height:260px}.captureReviewWorkspace textarea{width:100%}.captureReviewWorkspace [data-review-state]{padding:10px;background:#15313b}.captureReviewWorkspace details{margin:16px 0}.captureReviewWorkspace img{width:100px;height:80px;object-fit:cover;margin:4px}.captureReviewWorkspace [data-review-actions]{position:sticky;bottom:0;background:#071018;padding:10px}@media(max-width:700px){.captureReviewWorkspace [data-review-grid]{display:block}}</style><nav><label>Show <select data-review-filter><option value="review_required">Awaiting review</option><option value="approved">Approved</option><option value="rejected">Changes requested</option><option value="all">All improvements</option></select></label><button data-review-refresh>Refresh</button></nav><p data-review-state role="status">Loading improvements…</p><div data-review-grid><div data-review-list></div><section data-review-detail aria-label="Selected improvement"></section></div>';
  const $=q=>host.querySelector(q),status=m=>$('[data-review-state]').textContent=m;
  async function select(id){
    if(busy)return;const token=++request;viewer?.dispose();viewer=null;current=null;$('[data-review-detail]').replaceChildren();status('Loading this submitted version…');
    try{
      const detail=await api.getRealityCaptureModerationDetail(id);if(disposed||token!==request)return;
      current=detail.capture;const c=current,home=c.captureKind==='interior_room',submitted=c.hybridSubmission,revision=submitted?.revision;
      const panel=$('[data-review-detail]');panel.append(text('h3',`${c.building?.label||'Mapped building'} · ${home?'Interior':'Exterior'}`),Object.assign(text('p',`${captureWorkflow(c).title}${revision?` · submitted version ${revision}`:''}`),{className:'reviewVersionStatus'}),text('p',home?(c.publicContributionRequested?'Public interior access requested. Approval will make this version public.':'Private interior. Approval keeps access limited to the owner and authorized guests.'):(c.publicContributionRequested?'Public exterior improvement requested.':'Private exterior submission; approval alone does not publish it.')));
      const actions=document.createElement('nav');actions.dataset.reviewActions='';
      const approve=button('Approve improvement',()=>decide('approved')),reject=button('Request changes',()=>decide('rejected'));approve.disabled=true;reject.disabled=c.status!=='review_required';actions.append(approve,reject);
      const note=document.createElement('textarea');note.dataset.reviewNote='';note.placeholder='Review note (required when requesting changes)';note.maxLength=400;note.setAttribute('aria-label','Review note');
      const preview=document.createElement('div');preview.dataset.reviewPreview='';panel.append(preview,note,actions);
      const next=document.createElement('nav');next.append(button('Open this building in the world',()=>onOpenWorld?onOpenWorld(c):location.assign(captureWorldUrl(c.building))));if(onEdit)next.append(button('Open contribution',()=>onEdit(c.captureId)));panel.append(next);
      const originals=document.createElement('details');originals.append(text('summary','Original photos · private'));for(const item of detail.thumbnails||[]){const img=document.createElement('img');img.src=item.url;img.alt='Submitted photo for review';img.referrerPolicy='no-referrer';originals.append(img);}panel.append(originals);
      host.querySelectorAll('[data-review-id]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.reviewId===id)));
      status('Inspect the submitted preview, then approve it or request changes.');
      if(!detail.model?.url){status('No submitted model is ready. Return to the editor and submit the saved improvement.');return;}
      const response=await fetch(detail.model.url,{signal:controller.signal,cache:'no-store',credentials:'omit'});if(!response.ok)throw Error('The protected preview could not load.');const bytes=await response.arrayBuffer();if(disposed||token!==request)return;
      const created=await createCaptureViewer(preview,bytes,controller.signal,{homeLayout:submitted?.kind==='home-layout'?submitted.layout:null,exteriorBuilding:submitted?.kind==='facade-patches'?c.building:null,patchHeightMeters:submitted?.heightMeters,spatialContext:home?null:c.building?.spatialContext,alignment:c.review?.alignment||{}});
      if(disposed||token!==request){created?.dispose();return;}viewer=created;
      const views=document.createElement('nav');views.setAttribute('aria-label','Preview views');views.append(button('Overview',()=>viewer?.reset()),button('Rotate view',()=>viewer?.rotate()));
      if(submitted?.kind==='home-layout'){const entrance=layoutEntrance(submitted.layout),position={x:entrance.point.x+entrance.inward.x,y:entrance.floor.elevation+1.6,z:entrance.point.z+entrance.inward.z};views.append(button('Inside · walls and ceiling',()=>viewer?.setInside(position,entrance.inward)),button('Look at floor',()=>viewer?.setInside(position,{y:-1,z:.001})),button('Look at ceiling',()=>viewer?.setInside(position,{y:1,z:.001})));}
      preview.after(views);approve.disabled=c.status!=='review_required'||!viewer;
      async function decide(decision){
        if(busy||disposed||current!==c)return;const message=note.value.trim();if(decision==='rejected'&&!message){status('Explain what needs changing before returning this improvement.');note.focus();return;}
        busy=true;approve.disabled=reject.disabled=true;$('[data-review-refresh]').disabled=$('[data-review-filter]').disabled=true;
        try{await api.moderateRealityCapture(c.captureId,decision,message,c.review?.alignment||{},revision);if(disposed)return;status(decision==='approved'?'Approved. Open this building in the world to test this version.':'Changes requested. The contributor can revise and submit again.');c.status=decision;if(c.hybridSubmission)c.hybridSubmission.status=decision;panel.querySelector('.reviewVersionStatus').textContent=`${captureWorkflow(c).title}${revision?` · submitted version ${revision}`:''}`;host.querySelectorAll('[data-review-id]').forEach(b=>{if(b.dataset.reviewId===c.captureId)b.textContent=captureLabel(c);});}
        catch(error){if(disposed)return;status(`Review was not saved: ${error.message}`);approve.disabled=!viewer;reject.disabled=false;}
        finally{busy=false;if(disposed)return;$('[data-review-refresh]').disabled=$('[data-review-filter]').disabled=false;}
      }
    }catch(error){if(!disposed&&token===request)status(`Unable to open review: ${error.message}`);}
  }
  async function refresh(){
    if(busy)return;const token=++request;viewer?.dispose();viewer=null;current=null;$('[data-review-list]').replaceChildren();$('[data-review-detail]').replaceChildren();status('Loading improvements…');
    try{const result=await api.listRealityCaptureModeration($('[data-review-filter]').value);if(disposed||token!==request)return;const items=result.items||[];
      for(const c of items){const b=button(captureLabel(c),()=>select(c.captureId));b.dataset.reviewId=c.captureId;$('[data-review-list]').append(b);}
      status(items.length?`${items.length} improvements${items.length>=40?' · first 40 shown':''}`:'No improvements in this queue.');
      if(captureId){const id=captureId;captureId='';await select(id);}else if(items.length)await select(items[0].captureId);
    }catch(error){if(!disposed&&token===request)status(`Review access unavailable: ${error.message}`);}
  }
  $('[data-review-filter]').onchange=refresh;$('[data-review-refresh]').onclick=refresh;void refresh();
  return ()=>{disposed=true;request++;controller.abort();viewer?.dispose();host.replaceChildren();};
}

export function mountContributionWorkspace(host,{onEdit,api={listMyRealityCaptures}}={}){
  let disposed=false,request=0;host.replaceChildren(text('p','Your saved building improvements. Choose one to edit, submit, or check its status.'));
  const list=document.createElement('div'),status=text('p','Loading your contributions…');status.setAttribute('role','status');host.append(status,list);
  async function refresh(){const token=++request;try{const result=await api.listMyRealityCaptures();if(disposed||token!==request)return;list.replaceChildren();status.textContent=result.captures?.length?'':'No saved improvements yet. Choose a building in the world to begin.';for(const c of result.captures||[]){const row=document.createElement('article');row.append(text('h3',c.building?.label||'Mapped building'),text('p',captureLabel(c)),button('Open contribution',()=>onEdit?onEdit(c.captureId):location.assign(`/app/capture.html#capture=${encodeURIComponent(c.captureId)}`)),button('Open building in world',()=>location.assign(captureWorldUrl(c.building))));list.append(row);}}catch(error){if(!disposed)status.textContent=`Could not load your contributions: ${error.message}`;}}
  host.append(button('Refresh contributions',refresh));void refresh();return()=>{disposed=true;host.replaceChildren();};
}

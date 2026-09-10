import {getCurrentUser} from '../../../js/auth-ui.js?v=55';
import {loadLocalCaptureDraft,saveLocalCaptureDraftIfVersion} from './local-draft-store.js?v=1';
export const localSurveyEnabled=()=>['localhost','127.0.0.1','[::1]'].includes(location.hostname);
export const surveyOwner=()=>{const u=getCurrentUser();return u&&!u.isAnonymous?u.uid:'local-device';};
export const surveyKey=owner=>JSON.stringify(['photo-survey-v1',owner]);
export async function loadSurvey(owner=surveyOwner()){
  if(!localSurveyEnabled())throw Error('This survey preview is currently available only in the local test app.');
  const {draft,photos}=await loadLocalCaptureDraft(surveyKey(owner));
  return {survey:draft||{id:surveyKey(owner),ownerUid:owner,version:1,entries:[],previews:{}},photos};
}
export async function saveSurvey(survey,{previewChanged=false}={}){
  if(survey.ownerUid!==surveyOwner())throw Error('Account changed. Reopen your photo survey.');
  survey.draftVersion=await saveLocalCaptureDraftIfVersion(survey,survey.draftVersion||0);
  localStorage.setItem('we3d-local-survey-present','1');
  if(previewChanged)window.dispatchEvent(new Event('we3d-local-survey-changed'));
}
export const surveyBuildingKey=b=>JSON.stringify([b.worldId,b.sourceBuildingId]);

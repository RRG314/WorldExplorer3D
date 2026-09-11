const key='we3d.capture.sign-in-intent';
export function rememberCaptureIntent(target){try{sessionStorage.setItem(key,JSON.stringify({target,projectId:globalThis.WORLD_EXPLORER_FIREBASE?.projectId||'',createdAt:Date.now()}));}catch{}}
export function clearCaptureIntent(){try{sessionStorage.removeItem(key);}catch{}}
export function readCaptureIntent(){try{const intent=JSON.parse(sessionStorage.getItem(key)||'null');if(!intent)return null;if(intent.projectId!==(globalThis.WORLD_EXPLORER_FIREBASE?.projectId||'')||Date.now()-intent.createdAt>3600000){clearCaptureIntent();return null;}return intent;}catch{return null;}}

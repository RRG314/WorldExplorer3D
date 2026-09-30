import {MODEL_ASSET_REVISIONS} from './model-asset-revisions.js';
export function modelAssetRequestUrl(record){
 const revision=MODEL_ASSET_REVISIONS[record.id];
 if(!revision)throw new Error(`Missing model content revision: ${record.id}`);
 return `${record.url}${record.url.includes('?')?'&':'?'}revision=${revision}`;
}

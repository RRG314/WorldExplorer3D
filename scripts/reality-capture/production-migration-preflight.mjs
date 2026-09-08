// Read-only plan for one explicitly selected staging contribution. No copies,
// public writes, account changes, permissions changes, or deployment.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
const captureId=process.argv[2];
if(!/^capture_[a-f0-9]{32}$/.test(captureId||''))throw Error('Provide the exact approved staging capture ID');
const source='we3d-staging-20260712',destination='worldexplorer3d-d9b83';
const cli=createRequire(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()+'/firebase-tools/package.json');
const auth=cli('./lib/auth'),{requireAuth}=cli('./lib/requireAuth'),{Client}=cli('./lib/apiv2');
const operator=auth.getGlobalDefaultAccount();
await requireAuth({project:source,user:operator?.user,tokens:operator?.tokens});
const db=new Client({urlPrefix:'https://firestore.googleapis.com',auth:true});
const identity=new Client({urlPrefix:'https://identitytoolkit.googleapis.com',auth:true});
const storage=new Client({urlPrefix:'https://storage.googleapis.com',auth:true});
function value(v){if('stringValue'in v)return v.stringValue;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('booleanValue'in v)return v.booleanValue;if(v.arrayValue)return(v.arrayValue.values||[]).map(value);if(v.mapValue)return fields(v.mapValue.fields||{});return null;}
function fields(f){return Object.fromEntries(Object.entries(f).map(([k,v])=>[k,value(v)]));}
const root=project=>`/v1/projects/${project}/databases/(default)/documents`;
const capture=fields((await db.get(`${root(source)}/realityCaptures/${captureId}`)).body.fields);
if(capture.status!=='approved'||capture.captureKind!=='exterior'||capture.hybridSubmission?.status!=='approved')throw Error('Only an approved manual exterior can be planned');
const user=(await identity.post(`/v1/projects/${source}/accounts:lookup`,{localId:[capture.ownerUid]})).body.users?.[0];
if(!user?.email)throw Error('A verified owner mapping is required');
const targetUsers=(await identity.post(`/v1/projects/${destination}/accounts:lookup`,{email:[user.email]})).body.users||[];
const refs=(await db.post(`${root(source)}:runQuery`,{structuredQuery:{from:[{collectionId:'buildingRepresentations'}],where:{fieldFilter:{field:{fieldPath:'captureId'},op:'EQUAL',value:{stringValue:captureId}}}}})).body;
const representations=refs.filter(r=>r.document).map(r=>fields(r.document.fields));
const prefix=`reality-captures/${capture.ownerUid}/${captureId}/`;
let objects=[],pageToken;
do{const result=(await storage.get(`/storage/v1/b/${source}.firebasestorage.app/o`,{queryParams:{prefix,...(pageToken?{pageToken}:{})}})).body;objects.push(...(result.items||[]));pageToken=result.nextPageToken;}while(pageToken);
const original=objects.filter(o=>o.name.startsWith(prefix+'originals/'));
const matched=representations.filter(r=>r.status==='approved'&&r.modelPath===capture.hybridSubmission.modelPath&&String(r.modelGeneration)===String(capture.hybridSubmission.modelGeneration));
const hasDerivative=objects.some(o=>o.name===capture.hybridSubmission.modelPath&&String(o.generation)===String(capture.hybridSubmission.modelGeneration));
const productionConfig=JSON.parse(await fs.readFile(new URL('../../config/firebase.production.json',import.meta.url),'utf8'));
const report={readOnly:true,source,destination,captureId,canonicalBuilding:capture.building.sourceBuildingId,revision:capture.hybridSubmission.revision,
  originalPhotos:original.length,totalMediaBytes:objects.reduce((sum,o)=>sum+Number(o.size||0),0),approvedRepresentations:matched.length,approvedDerivativePresent:hasDerivative,
  ownerMapping:targetUsers.length===1?'matching-production-account':'requires-resolution',sameUid:targetUsers.length===1&&targetUsers[0].localId===capture.ownerUid,
  rawPhotosWithPermanentDownloadToken:original.filter(o=>o.metadata?.firebaseStorageDownloadTokens).length,
  productionAppCheckConfigured:!!productionConfig.appCheckSiteKey,
  remaining:['Copy selected media with generation/checksum verification at promotion','Rewrite environment-specific ownership/path/generation references','Preserve review provenance and canonical target','Verify private originals and hard-refresh world publication']};
console.log(JSON.stringify(report,null,2));

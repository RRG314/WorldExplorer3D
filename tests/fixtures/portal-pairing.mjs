import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PORTAL_NATIVE_CLIENTS} from '../../app/js/portal/native-contract.js';
const {buildPortalPairingExports}=createRequire(import.meta.url)('../../functions/portal-pairing.js');
const projectId='we3d-staging-20260712',android=Object.keys(PORTAL_NATIVE_CLIENTS[projectId])[0];
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
export function portalPairingFixture(){
  const records=new Map(),writes=[],minted=[];let clock=1800000000000,check={appId:android},auth={uid:'owner',auth_time:clock/1000,firebase:{sign_in_provider:'google.com'}},disabled=false,revokedAt=0;
  let tail=Promise.resolve(),mint=async uid=>{minted.push(uid);return `controlled-token-${minted.length}`;};
  const snapshot=(map,path)=>({exists:map.has(path),data:()=>clone(map.get(path))});
  const ref=path=>({path,get:async()=>snapshot(records,path)});
  const db={collection:name=>({doc:id=>ref(`${name}/${id}`)}),runTransaction(work){
    const pending=tail.then(async()=>{const draft=new Map([...records].map(([key,value])=>[key,clone(value)])),changes=[];let writing=false;
      const result=await work({get:async r=>{assert.equal(writing,false,'all reads precede transaction writes');return snapshot(draft,r.path);},
        create(r,value){writing=true;if(draft.has(r.path))throw Error('already-exists');draft.set(r.path,clone(value));changes.push(r.path);},
        set(r,value){writing=true;draft.set(r.path,clone(value));changes.push(r.path);}});
      records.clear();for(const [key,value]of draft)records.set(key,value);writes.push(...changes);return result;});tail=pending.catch(()=>{});return pending;
  }};
  const functions={region:()=>({runWith(){return this;},https:{onRequest:handler=>handler}})};
  const endpoints=buildPortalPairingExports({functions,db,projectId,now:()=>clock,setCors:()=>false,verifyAppCheck:async(req,res)=>{if(!check)res.status(401).json({error:'attestation required'});return check;},
    verifyAuth:async(req,res)=>{if(!auth)res.status(401).json({error:'auth required'});return auth;},getUser:async()=>({disabled,tokensValidAfterTime:new Date(revokedAt).toISOString()}),createCustomToken:uid=>mint(uid)});
  const call=async(name,body={},method='POST')=>{const res={code:200,headers:{},status(code){this.code=code;return this;},set(key,value){this.headers[key]=value;},json(body){this.body=body;return this;}};
    await endpoints[name]({method,body,ip:'controlled-test-client'},res);return res;};
  return {call,records,writes,minted,setCheck:value=>check=value,setAuth:value=>auth=value,setTime:value=>clock=value,
    setDisabled:value=>disabled=value,setRevokedAt:value=>revokedAt=value,setMint:value=>mint=value,now:()=>clock};
}

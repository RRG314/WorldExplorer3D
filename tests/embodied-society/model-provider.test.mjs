import test from 'node:test';
import assert from 'node:assert/strict';
import {createModelProvider} from '../../scripts/embodied-society/model-provider.mjs';
const config={provider:'openai',model:'test-model',budgetUsd:1,inputUsdPerMillion:1,outputUsdPerMillion:2,maxCalls:2,maxOutputTokens:256};
const response=action=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(action)}]}],usage:{input_tokens:20,output_tokens:10}}));
test('durable reservation precedes real HTTP adapter dispatch and secret stays in Authorization only',async()=>{
 const writes=[];let request;
 const provider=createModelProvider({config,apiKey:'test-secret',store:{save:async value=>writes.push(structuredClone(value))},fetchImpl:async(url,options)=>{assert.equal(writes.length,1);request={url,...options};return response({kind:'wait'});}});
 assert.deepEqual(await provider.decide({actorId:'a'}),{kind:'wait'});
 assert.equal(request.url,'https://api.openai.com/v1/responses');assert.equal(request.headers.Authorization,'Bearer test-secret');
 const body=JSON.parse(request.body);assert.equal(body.store,false);assert.deepEqual(body.tools,[]);assert.equal(body.text.format.strict,true);
 assert.equal(JSON.stringify(writes).includes('test-secret'),false);assert.equal(JSON.stringify(provider.status()).includes('test-secret'),false);
 assert.equal(writes.at(-1).events[0].status,'completed');assert.ok(provider.status().reservedUsd>0);
});
test('failed reservation, exhausted budget and concurrent calls cannot dispatch extra requests',async()=>{
 let count=0;
 const broken=createModelProvider({config,apiKey:'key',store:{save:async()=>{throw Error('disk full');}},fetchImpl:async()=>{count++;}});
 await assert.rejects(broken.decide({}),/disk full/);assert.equal(count,0);
 const empty=createModelProvider({config:{...config,budgetUsd:.000001},apiKey:'key',store:{save:async()=>{}},fetchImpl:async()=>{count++;}});
 await assert.rejects(empty.decide({}),/allowance/);assert.equal(count,0);
 let done;const provider=createModelProvider({config,apiKey:'key',store:{save:async()=>{}},fetchImpl:()=>new Promise(resolve=>{done=resolve;})});
 const first=provider.decide({});await Promise.resolve();await assert.rejects(provider.decide({}),/busy/);done(response({kind:'wait'}));await first;
});
test('lost response is never retried or refunded, and restart retains reservation',async()=>{
 let saved,count=0;const store={save:async value=>{saved=structuredClone(value);}};
 const provider=createModelProvider({config,apiKey:'key',store,fetchImpl:async()=>{count++;throw Error('connection lost');}});
 await assert.rejects(provider.decide({}),/connection lost/);await assert.rejects(provider.decide({}),/recovery/);assert.equal(count,1);
 const restored=createModelProvider({config,apiKey:'key',store,initialLedger:saved,fetchImpl:async()=>response({kind:'wait'})});
 assert.equal(restored.status().calls,1);assert.ok(restored.status().reservedUsd>0);await restored.decide({});await assert.rejects(restored.decide({}),/allowance/);
});
test('invalid model response and oversized observations fail closed',async()=>{
 const provider=createModelProvider({config,apiKey:'key',store:{save:async()=>{}},fetchImpl:async()=>response({kind:'execute',code:'bad'})});
 await assert.rejects(provider.decide({}),/Invalid/);
 const bounded=createModelProvider({config,apiKey:'key',store:{save:async()=>{}},fetchImpl:async()=>{throw Error('must not dispatch');}});
 await assert.rejects(bounded.decide({text:'x'.repeat(33000)}),/input limit/);
});
const freeConfig={provider:'groq',model:'openai/gpt-oss-20b',accountTier:'free',freePlanConfirmed:true,budgetUsd:0,inputUsdPerMillion:0,outputUsdPerMillion:0,maxCalls:2,maxOutputTokens:2048,minDecisionIntervalMs:60000};
test('free hosted adapter reserves calls, uses strict actions, spaces calls and retains spacing after restart',async()=>{
 let saved,request,count=0;const store={save:async value=>{saved=structuredClone(value);}};
 const fetchImpl=async(url,options)=>{count++;assert.equal(saved.calls,1);request={url,...options};return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({kind:'move',move:1,frames:60})}}],usage:{prompt_tokens:100,completion_tokens:20}}));};
 const provider=createModelProvider({config:freeConfig,apiKey:'private',store,fetchImpl});
 assert.deepEqual(await provider.decide({actorId:'resident'}),{kind:'move',move:1,frames:60});
 assert.equal(request.url,'https://api.groq.com/openai/v1/chat/completions');const body=JSON.parse(request.body);
 assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.max_completion_tokens,2048);assert.equal(body.tools,undefined);
 assert.equal(provider.status().reservedUsd,0);assert.deepEqual(saved.events[0].usage,{inputTokens:100,outputTokens:20});
 await assert.rejects(provider.decide({}),/interval/);
 const restart=createModelProvider({config:freeConfig,apiKey:'private',store,fetchImpl,initialLedger:saved});await assert.rejects(restart.decide({}),/interval/);assert.equal(count,1);
});
test('free configuration refuses paid allowance, missing confirmation and unsupported models',()=>{
 for(const changes of [{budgetUsd:1},{freePlanConfirmed:false},{accountTier:'paid'},{model:'arbitrary'},{minDecisionIntervalMs:0}])assert.throws(()=>createModelProvider({config:{...freeConfig,...changes},apiKey:'key',store:{save:async()=>{}}}));
});
test('free quota exhaustion stops without retries, paid fallback or losing the call reservation',async()=>{
 let saved,count=0;const provider=createModelProvider({config:freeConfig,apiKey:'key',store:{save:async value=>{saved=value;}},fetchImpl:async()=>{count++;return new Response('{}',{status:429});}});
 await assert.rejects(provider.decide({}),/quota reached/);assert.equal(saved.calls,1);assert.equal(saved.reservedUsd,0);
 await assert.rejects(provider.decide({}),/recovery/);assert.equal(count,1);
});
test('Gemini uses native JSON actions and header-only key, excludes thoughts, and records thinking token usage',async()=>{
 let request,saved;const config={...freeConfig,provider:'gemini',model:'gemini-3.8-flash'};
 const provider=createModelProvider({config,apiKey:'gemini-private-key',store:{save:async value=>{saved=value;}},fetchImpl:async(url,options)=>{request={url,...options};assert.equal(saved.calls,1);return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'not an action'},{text:'{"action":{"kind":"gather","targetId":"water","quantity":1}}'}]}}],usageMetadata:{promptTokenCount:50,candidatesTokenCount:20,thoughtsTokenCount:30}}));}});
 assert.deepEqual(await provider.decide({actorId:'resident'}),{kind:'gather',targetId:'water',quantity:1});
 assert.equal(request.url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');assert.equal(request.headers['x-goog-api-key'],'gemini-private-key');assert.equal(request.headers.Authorization,undefined);
 const body=JSON.parse(request.body);assert.equal(body.generationConfig.responseMimeType,'application/json');assert.equal(body.generationConfig.responseJsonSchema.additionalProperties,false);assert.equal(body.tools,undefined);
 assert.equal(JSON.stringify(saved).includes('gemini-private-key'),false);assert.deepEqual(saved.events[0].usage,{inputTokens:50,outputTokens:50});await assert.rejects(provider.decide({}),/interval/);
});
test('Gemini refuses truncated or blocked responses instead of applying partial actions',async()=>{
 for(const result of [{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{"kind":"wait"}'}]}}]},{promptFeedback:{blockReason:'SAFETY'}}]){
 const provider=createModelProvider({config:{...freeConfig,provider:'gemini',model:'gemini-3.8-flash'},apiKey:'key',store:{save:async()=>{}},fetchImpl:async()=>new Response(JSON.stringify(result))});await assert.rejects(provider.decide({}),/did not complete/);
 }
});
test('transient provider details are redacted and retries retain reservations; other failures cannot recover',async()=>{
 let saved,calls=0;const provider=createModelProvider({config,apiKey:'private-secret',store:{save:async v=>{saved=v;}},fetchImpl:async()=>++calls===1?new Response(JSON.stringify({error:{message:'Busy private-secret AQ.secret123 https://example.test/?key=secret'}}),{status:503}):response({kind:'wait'})});
 await assert.rejects(provider.decide({}),e=>e.message.includes('503')&&!e.message.includes('private-secret')&&!e.message.includes('secret123'));
 assert.equal(saved.events[0].httpStatus,503);provider.recover();await provider.decide({});assert.equal(saved.calls,2);assert.ok(saved.reservedUsd>saved.events[0].reservedUsd);
 const denied=createModelProvider({config,apiKey:'key',store:{save:async()=>{}},fetchImpl:async()=>new Response('{}',{status:403})});await assert.rejects(denied.decide({}));assert.throws(()=>denied.recover(),/transient/);
});
test('shared-schema neutral slots become one canonical command without inventing an action',async()=>{
 const {normalizeModelAction}=await import('../../scripts/embodied-society/model-provider.mjs');
 const full={kind:'gather',targetId:'supply-0',quantity:1,move:0,strafe:0,turn:0,lookYaw:0,lookPitch:0,frames:0,recipeId:'',materialId:'',seconds:0,placement:null};
 assert.deepEqual(normalizeModelAction(full),{kind:'gather',targetId:'supply-0',quantity:1});
 assert.deepEqual(normalizeModelAction({...full,kind:'wait',targetId:'',quantity:0}),{kind:'wait'});
 assert.throws(()=>normalizeModelAction({...full,move:1}),/Conflicting/);
 assert.throws(()=>normalizeModelAction({...full,actorId:'someone-else'}),/Invalid/);
});
test('Gemini schema gives each verb its own exact fields, so gather cannot request movement',async()=>{
 const {GEMINI_ACTION_SCHEMA}=await import('../../scripts/embodied-society/model-provider.mjs');
 const shapes=GEMINI_ACTION_SCHEMA.properties.action.anyOf;assert.equal(shapes.length,11);
 const gather=shapes.find(s=>s.properties.kind.enum[0]==='gather');assert.deepEqual(Object.keys(gather.properties).sort(),['kind','quantity','targetId']);assert.equal(gather.additionalProperties,false);
 const wait=shapes.find(s=>s.properties.kind.enum[0]==='wait');assert.deepEqual(Object.keys(wait.properties),['kind']);
});

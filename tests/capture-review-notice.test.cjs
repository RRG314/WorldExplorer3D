const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reviewNotice, deliverReviewNotice } = require('../functions/capture-review-notice');
test('only a submitted revision creates a review event', () => {
  assert.equal(reviewNotice(null, {status:'uploaded'}, 'a'), null);
  const capture = {status:'review_required',hybridSubmission:{revision:2}};
  assert.equal(reviewNotice(capture, {...capture,reviewEmail:{status:'accepted'}}, 'a'), null);
  assert.equal(reviewNotice(null, capture, 'a').key, 'capture-review/a/2');
  assert.ok(reviewNotice(capture, {...capture,hybridSubmission:{revision:3}}, 'a'));
  assert.equal(reviewNotice(capture,null,'a'),null);
});
function fixture() {
  let data={status:'review_required',hybridSubmission:{revision:2}};
  return {get data(){return data;},ref:{get:async()=>({exists:true,data:()=>data}),update:async patch=>{data={...data,...patch};}}};
}
const notice={captureId:'a',revision:'2',key:'capture-review/a/2'};
test('missing sender is recorded honestly, without sending',async()=>{
  const f=fixture();await deliverReviewNotice({ref:f.ref,notice,config:{},fetchImpl:()=>{throw Error('must not send');}});
  assert.equal(f.data.reviewEmail.status,'not_configured');
});
test('accepted email is deduplicated and links directly to capture review',async()=>{
  const f=fixture();let calls=0;
  const options={ref:f.ref,notice,config:{resendApiKey:'test',emailFrom:'test@example.com',adminNotificationEmail:'admin@example.com',moderationPanelUrl:'https://example.com/account/admin.html'},fetchImpl:async(url,opts)=>{
    calls++;assert.equal(opts.headers['Idempotency-Key'],notice.key);
    assert.match(JSON.parse(opts.body).text,/queue=reality&capture=a/);
    return {ok:true,json:async()=>({id:'provider-id'})};
  }};
  await deliverReviewNotice(options);await deliverReviewNotice(options);assert.equal(calls,1);
  assert.equal(f.data.reviewEmail.status,'accepted');
});
test('failed delivery remains retryable without losing submission',async()=>{
  const f=fixture();await assert.rejects(deliverReviewNotice({ref:f.ref,notice,config:{resendApiKey:'x',emailFrom:'x',adminNotificationEmail:'x',moderationPanelUrl:'https://example.com'},fetchImpl:async()=>({ok:false,status:503})}));
  assert.equal(f.data.reviewEmail.status,'failed');assert.equal(f.data.status,'review_required');
});
test('expired retry window does not send a duplicate',async()=>{
  const f=fixture();await deliverReviewNotice({ref:f.ref,notice:{...notice,eventTimeMs:Date.now()-24*60*60*1000},config:{},fetchImpl:()=>{throw Error('must not send');}});
  assert.equal(f.data.reviewEmail.status,'needs_attention');
});

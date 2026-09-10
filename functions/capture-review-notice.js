'use strict';

// Derive events from authoritative submission state, never from a browser Save.
function reviewNotice(before, after, captureId) {
  if (!after || after.status !== 'review_required') return null;
  const revision = String(after.hybridSubmission?.revision || after.processingAttemptId || 'initial');
  const previous = String(before?.hybridSubmission?.revision || before?.processingAttemptId || 'initial');
  if (before?.status === 'review_required' && revision === previous) return null;
  return { captureId, revision, key: `capture-review/${captureId}/${revision}` };
}

async function deliverReviewNotice({ ref, notice, config, fetchImpl = fetch }) {
  const current = await ref.get();
  if (!current.exists || current.data().status !== 'review_required') return;
  const data = current.data();
  if (String(data.hybridSubmission?.revision || data.processingAttemptId || 'initial') !== notice.revision) return;
  if (data.reviewEmail?.key === notice.key && data.reviewEmail.status === 'accepted') return;
  const record = { key: notice.key, checkedAtMs: Date.now() };
  // Provider idempotency lasts 24h. Never retry an ambiguous send outside it.
  if (notice.eventTimeMs && Date.now() - notice.eventTimeMs > 23 * 60 * 60 * 1000) {
    await ref.update({ reviewEmail: { ...record, status: 'needs_attention' } });
    return;
  }
  if (!config.resendApiKey || !config.emailFrom || !config.adminNotificationEmail) {
    await ref.update({ reviewEmail: { ...record, status: 'not_configured' } });
    return;
  }
  const url = new URL(config.moderationPanelUrl);
  url.searchParams.set('view', 'moderation');
  url.searchParams.set('queue', 'reality');
  url.searchParams.set('capture', notice.captureId);
  // No private photos, signed asset links, home details, or user email in notices.
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': notice.key },
    body: JSON.stringify({ from: config.emailFrom, to: [config.adminNotificationEmail],
      subject: 'World Explorer: a building improvement is ready for review',
      text: `A building improvement is awaiting your decision. Sign in to inspect it securely.\n\n${url.href}\n\nInterior privacy is unchanged by submission or approval.` })
  });
  if (!response.ok) {
    const retryable = response.status >= 500 || [408, 409, 429].includes(response.status);
    await ref.update({ reviewEmail: { ...record, status: retryable ? 'failed' : 'needs_attention', httpStatus: response.status } });
    if (!retryable) return;
    throw new Error(`capture_review_email_http_${response.status}`);
  }
  const result = await response.json();
  await ref.update({ reviewEmail: { ...record, status: 'accepted', providerId: String(result.id || '') } });
}

function contributorNotice(before,after,captureId){
  if(!after?.ownerUid||!['review_required','approved','rejected'].includes(after.status))return null;
  const revision=String(after.hybridSubmission?.revision||after.processingAttemptId||'initial');
  if(before?.status===after.status&&String(before?.hybridSubmission?.revision||before?.processingAttemptId||'initial')===revision)return null;
  return {type:'reality_capture',captureId,revision,status:after.status,ownerUid:after.ownerUid,
    title:after.status==='approved'?'Your building improvement was approved':after.status==='rejected'?'Your improvement needs changes':'Your improvement is awaiting review'};
}
module.exports = { reviewNotice, deliverReviewNotice, contributorNotice };

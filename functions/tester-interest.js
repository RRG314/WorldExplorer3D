'use strict';
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const CONSENT = 'app-testing-v1';
const HOUR = 60 * 60 * 1000;

// Private Firestore records own consent; Resend only delivers the requested
// verification. No account, location, gameplay data or marketing audience copy.
function buildTesterInterestExport({functions, db, setCors, verifyAppCheck, config,
  fetchImpl = fetch, now = Date.now, randomToken = () => crypto.randomBytes(32).toString('hex')}) {
  return functions.region('us-central1').runWith({invoker:'public', timeoutSeconds:30, maxInstances:3}).https.onRequest(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (setCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({error:'Use POST.'});
    const body = req.body || {};
    try {
      const time = now();
      if (body.action === 'confirm') {
        if (!/^[a-f0-9]{64}$/.test(body.token || '')) return res.status(400).json({error:'This confirmation link is invalid or expired.'});
        const ref = db.collection('appTesterConfirmations').doc(hash(body.token));
        const accepted = await db.runTransaction(async tx => {
          const snapshot = await tx.get(ref), record = snapshot.data();
          if (!record || record.expiresAtMs <= time) return false;
          // A repeat click is idempotent; link scanners cannot confirm via GET.
          if (record.confirmedAtMs) return true;
          const interest = db.collection('appTesterInterests').doc(hash(record.email));
          tx.set(interest, {email:record.email, consentVersion:CONSENT, source:'start-hub', confirmedAtMs:time});
          tx.update(ref, {confirmedAtMs:time});
          return true;
        });
        return res.status(accepted ? 200 : 400).json(accepted ? {confirmed:true} : {error:'This confirmation link is invalid or expired. Request a new one from the game.'});
      }
      if (body.action !== 'request' || body.consentVersion !== CONSENT || body.consent !== true ||
          typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(body.email.trim())) {
        return res.status(400).json({error:'Enter a valid email and agree to receive app-testing invitations.'});
      }
      if (!await verifyAppCheck(req, res)) return;
      const cfg = config();
      if (!cfg.resendApiKey || !cfg.emailFrom) return res.status(503).json({error:'Tester signup is temporarily unavailable. Please try again later.'});
      const email = body.email.trim().toLowerCase(), token = randomToken();
      const ref = db.collection('appTesterConfirmations').doc(hash(token));
      // Distributed quotas survive instance replacement. Raw IPs never persist.
      const bucket = Math.floor(time / HOUR);
      const counters = [
        {ref:db.collection('appTesterRequestLimits').doc(`email-${hash(email)}`), max:3},
        {ref:db.collection('appTesterRequestLimits').doc(`ip-${hash(String(req.ip || 'unknown'))}`), max:10},
        {ref:db.collection('appTesterRequestLimits').doc('global'), max:75}
      ];
      const admitted = await db.runTransaction(async tx => {
        const snapshots = await Promise.all(counters.map(c => tx.get(c.ref)));
        const counts = snapshots.map(s => s.data()?.bucket === bucket ? s.data().count : 0);
        if (counts.some((count,i) => count >= counters[i].max)) return false;
        counters.forEach((c,i) => tx.set(c.ref, {bucket, count:counts[i]+1, expiresAt:new Date(time+2*HOUR)}));
        tx.create(ref, {email, consentVersion:CONSENT, requestedAtMs:time, expiresAtMs:time+HOUR, expiresAt:new Date(time+24*HOUR)});
        return true;
      });
      if (!admitted) return res.status(429).json({error:'Please wait before requesting another confirmation email.'});
      // Fixed destination, fragment-only token, no redirect supplied by caller.
      const project = String(process.env.GCLOUD_PROJECT || '');
      const origin = project === 'worldexplorer3d-d9b83' ? 'https://worldexplorer3d.io' : `https://${project}.web.app`;
      const link = `${origin}/account/tester.html#${token}`;
      const response = await fetchImpl('https://api.resend.com/emails', {
        method:'POST', signal:AbortSignal.timeout(10000),
        headers:{Authorization:`Bearer ${cfg.resendApiKey}`, 'Content-Type':'application/json', 'Idempotency-Key':`tester/${hash(token)}`},
        body:JSON.stringify({from:cfg.emailFrom, to:[email], subject:'Confirm your World Explorer tester interest',
          text:`You asked to hear about testing the new World Explorer app.\n\nOpen this link and choose Confirm interest within one hour:\n${link}\n\nTesting invitations depend on availability. This does not subscribe you to a newsletter. If you did not request this, ignore this email. To remove your interest later, email mail@worldexplorer3d.io.`})
      });
      if (!response.ok) return res.status(503).json({error:'We could not confirm email delivery. Please wait a few minutes and try again.'});
      return res.status(200).json({pending:true});
    } catch (_) {
      // Never include email, token, provider response or credentials in logs.
      return res.status(503).json({error:'Tester signup is temporarily unavailable. Please try again later.'});
    }
  });
}
module.exports = {buildTesterInterestExport};

'use strict';
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const CONSENT = 'app-testing-v1';
const HOUR = 60 * 60 * 1000;
const {template,siteOrigin,REPLY_ADDRESS} = require('./tester-mail');

// Private Firestore records own consent; Resend only delivers the requested
// verification. No account, location, gameplay data or marketing audience copy.
function buildTesterInterestExport({functions, db, setCors, verifyAppCheck, config,
  fetchImpl = fetch, now = Date.now, randomToken = () => crypto.randomBytes(32).toString('hex'), program}) {
  program ||= require('./tester-program').createTesterProgram({db,config,fetchImpl,now,randomToken});
  return functions.region('us-central1').runWith({invoker:'public', timeoutSeconds:30, maxInstances:3}).https.onRequest(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (setCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({error:'Use POST.'});
    const body = req.body || {};
    try {
      const time = now();
      if (['confirm','invitation','withdraw','status'].includes(body.action)) return res.status(200).json(await program.publicAction(body));
      if (body.action !== 'request' || body.consentVersion !== CONSENT || body.consent !== true ||
          typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(body.email.trim())) {
        return res.status(400).json({error:'Enter a valid email and agree to receive app-testing invitations.'});
      }
      if (!await verifyAppCheck(req, res)) return;
      const cfg = config();
      if (!cfg.resendApiKey || !cfg.emailFrom || !cfg.adminNotificationEmail) return res.status(503).json({error:'Tester signup is temporarily unavailable. Please try again later.'});
      const email = body.email.trim().toLowerCase(), token = randomToken();
      if(cfg.testRecipients?.length && !cfg.testRecipients.includes(email)) return res.status(403).json({error:'This staging form accepts only the configured test email address.'});
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
      const link = `${siteOrigin()}/account/tester.html#${token}`;
      const response = await fetchImpl('https://api.resend.com/emails', {
        method:'POST', signal:AbortSignal.timeout(10000),
        headers:{Authorization:`Bearer ${cfg.resendApiKey}`, 'Content-Type':'application/json', 'Idempotency-Key':`tester/${hash(token)}`},
        body:JSON.stringify({from:cfg.emailFrom, to:[email], reply_to:REPLY_ADDRESS, ...template('verification',{verifyUrl:link})})
      });
      if (!response.ok) return res.status(503).json({error:'We could not confirm email delivery. Please wait a few minutes and try again.'});
      return res.status(200).json({pending:true});
    } catch (error) {
      // Never include email, token, provider response or credentials in logs.
      return res.status(error.status||503).json({error:error.status?error.message:'Tester signup is temporarily unavailable. Please try again later.'});
    }
  });
}
module.exports = {buildTesterInterestExport};

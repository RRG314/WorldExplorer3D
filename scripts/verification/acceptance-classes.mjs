import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { artifactIdentity, sameArtifactIdentity } from './artifact-identity.mjs';

// Automated candidate/backend execution is checked separately. These classes
// cannot be satisfied by viewport emulation or a disposable App Check token.
// The historical weather-entitlement key accepts documented public-use rights;
// it does not require a subscription. Check the deployed gateway and attribution.
export const REQUIRED_ACCEPTANCE = Object.freeze({
  'ordinary-hosted': { checks: ['coldStart', 'warmStart', 'locationSearch', 'signIn', 'sharedVoyage', 'saveRecovery'], maxAgeDays: 7 },
  'physical-ios': { checks: ['journey', 'touchControls', 'memory', 'thermal', 'resume'], maxAgeDays: 30 },
  'physical-android': { checks: ['journey', 'touchControls', 'memory', 'thermal', 'resume'], maxAgeDays: 30 },
  'fresh-player': { checks: ['uncoachedExplorationLoop', 'navigationComprehension', 'returnAndResume'], maxAgeDays: 30 },
  'weather-entitlement': { checks: ['commercialUsePermitted', 'deployedEndpointCovered', 'attribution'], maxAgeDays: 30 },
  'migration-rollback': { checks: ['existingSaveUpgrade', 'compatibleFallbackReadsUpgradedSave', 'fallbackWriteAndReturn', 'backendCompatibility', 'artifactRetained'], maxAgeDays: 7 }
});

// The owner may release with a documented device/usability review still open.
// This affects release scope only: pending receipts never become passed, and
// ordinary hosted operation, public data rights and rollback cannot be deferred.
export function acceptanceReleaseDecision(results, required, deferred = {}) {
  const mandatory = ['ordinary-hosted', 'weather-entitlement', 'migration-rollback'];
  const deferrable = ['physical-ios', 'physical-android', 'fresh-player'];
  const failures = [];
  if (!Array.isArray(required) || new Set(required).size !== required.length ||
      required.some(id => !Object.hasOwn(REQUIRED_ACCEPTANCE, id))) failures.push('Invalid required acceptance classes');
  const selected = new Set(Array.isArray(required) ? required : []);
  for (const id of mandatory) if (!selected.has(id)) failures.push(`Cannot defer ${id}`);
  for (const id of Object.keys(deferred)) {
    if (!deferrable.includes(id) || selected.has(id)) failures.push(`Invalid deferral: ${id}`);
    if (!String(deferred[id]?.reason || '').trim() || !String(deferred[id]?.ownerDecision || '').trim()) failures.push(`Undocumented deferral: ${id}`);
  }
  for (const id of Object.keys(REQUIRED_ACCEPTANCE)) {
    if (!selected.has(id) && !Object.hasOwn(deferred, id)) failures.push(`Unaccounted acceptance class: ${id}`);
  }
  return { failures, ready: failures.length === 0 && [...selected].every(id => results[id]?.status === 'passed'),
    unverified: Object.keys(REQUIRED_ACCEPTANCE).filter(id => results[id]?.status !== 'passed') };
}

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function evaluateAcceptanceReceipt(id, receipt, { artifact, baseline, now = Date.now(), verifyEvidence = () => false, verifyFallback = () => false }) {
  const rule = REQUIRED_ACCEPTANCE[id];
  if (!rule) return { status: 'invalid', reasons: ['Unknown acceptance class'] };
  if (!receipt) return { status: 'pending', reasons: ['No current receipt'] };
  const reasons = [];
  if (receipt.contract !== 'world-explorer-acceptance-class-v1' || receipt.evidenceClass !== id) reasons.push('Wrong receipt class');
  if (!sameArtifactIdentity(receipt.artifactIdentity, artifact)) reasons.push('Artifact identity differs');
  if (!baseline?.acceptanceFingerprint || receipt.acceptanceFingerprint !== baseline.acceptanceFingerprint) reasons.push('Runtime, test or environment inputs differ');
  if (receipt.result !== 'passed') reasons.push('Acceptance did not pass');
  const observed = Date.parse(receipt.observedAt), expires = Date.parse(receipt.expiresAt);
  if (!Number.isFinite(observed) || observed > now || now - observed > rule.maxAgeDays * 86400000 ||
      !Number.isFinite(expires) || expires <= now || expires <= observed) reasons.push('Receipt is missing dates, stale or expired');
  if (typeof receipt.reviewer !== 'string' || !receipt.reviewer.trim()) reasons.push('Reviewer is required');
  for (const name of rule.checks) if (receipt.checks?.[name] !== true) reasons.push(`Missing passed check: ${name}`);
  if (!Array.isArray(receipt.evidenceFiles) || receipt.evidenceFiles.length === 0 ||
      !receipt.evidenceFiles.every(file => verifyEvidence(file) === true)) reasons.push('Evidence files missing or changed');
  if (id === 'ordinary-hosted' && (receipt.attestationMode !== 'ordinary' || receipt.providerMode !== 'live' || receipt.debugAttestation !== false)) reasons.push('Ordinary live hosted evidence is required');
  if (id.startsWith('physical-') && (receipt.device?.physical !== true || !receipt.device.model || !receipt.device.os || !receipt.device.browser)) reasons.push('Named physical device evidence is required');
  if (id === 'fresh-player' && receipt.coached !== false) reasons.push('Uncoached player evidence is required');
  if (id === 'weather-entitlement' && (!receipt.entitlementReference || !receipt.endpointConfigurationSha256 || !/^[a-f0-9]{64}$/.test(receipt.endpointConfigurationSha256))) reasons.push('Entitlement and endpoint configuration reference required; do not put keys in receipts');
  if (id === 'migration-rollback' && (!sameArtifactIdentity(receipt.fallbackArtifactIdentity, receipt.fallbackArtifactIdentity) ||
      sameArtifactIdentity(receipt.fallbackArtifactIdentity, artifact) || !receipt.compatibilityContract)) reasons.push('A distinct compatible fallback artifact and protocol contract are required');
  if (id === 'migration-rollback' && verifyFallback(receipt) !== true) reasons.push('Retained fallback bytes have not been verified');
  return { status: reasons.length ? 'invalid' : 'passed', reasons };
}

export function readAcceptanceClasses(root, context) {
  const base = path.join(root, 'output/release-evidence/current/acceptance');
  const verifyEvidence = file => {
    try {
      if (typeof file?.path !== 'string' || !file.path.startsWith('output/release-evidence/') || file.path.split('/').includes('..') ||
          !/^[a-f0-9]{64}$/.test(file.sha256 || '')) return false;
      const absolute = path.resolve(root, file.path);
      const allowedRoot = realpathSync(path.join(root, 'output/release-evidence')) + path.sep;
      if (!realpathSync(absolute).startsWith(allowedRoot) || !lstatSync(absolute).isFile()) return false;
      return hash(readFileSync(absolute)) === file.sha256;
    } catch { return false; }
  };
  const verifyFallback = receipt => {
    try {
      const relative = receipt.fallbackArtifactRoot;
      if (typeof relative !== 'string' || !relative.startsWith('output/') || relative.split('/').includes('..')) return false;
      if (!realpathSync(path.resolve(root, relative)).startsWith(realpathSync(path.join(root, 'output')) + path.sep)) return false;
      return sameArtifactIdentity(artifactIdentity(root, relative), receipt.fallbackArtifactIdentity);
    } catch { return false; }
  };
  return Object.fromEntries(Object.keys(REQUIRED_ACCEPTANCE).map(id => {
    let receipt;
    try { receipt = JSON.parse(readFileSync(path.join(base, `${id}.json`), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') return [id, { status: 'invalid', reasons: ['Unreadable receipt'] }]; }
    return [id, evaluateAcceptanceReceipt(id, receipt, { ...context, verifyEvidence, verifyFallback })];
  }));
}

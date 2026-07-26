import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const reviewedFindings = {
  root: new Set([
    'brace-expansion',
    'glob',
    'google-gax',
    'minimatch',
    'rimraf'
  ]),
  functions: new Set([
    'brace-expansion',
    'gaxios',
    'gcp-metadata',
    'glob',
    'google-gax',
    'minimatch',
    'rimraf'
  ])
};

function productionAudit(label, prefix = '') {
  const args = ['audit', '--omit=dev', '--json'];
  if (prefix) args.push('--prefix', prefix);
  const result = spawnSync(npmCommand, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  assert(
    result.stdout?.trim(),
    `${label} production audit produced no JSON: ${String(result.stderr || '').trim()}`
  );
  const report = JSON.parse(result.stdout);
  const vulnerabilities = report.vulnerabilities || {};
  const names = new Set(Object.keys(vulnerabilities));
  const expected = reviewedFindings[label];

  assert.equal(
    Number(report.metadata?.vulnerabilities?.critical || 0),
    0,
    `${label} production audit contains a critical advisory`
  );
  assert.deepEqual(
    [...names].sort(),
    [...expected].sort(),
    `${label} production audit differs from the reviewed 4.1 advisory set`
  );
  for (const [name, finding] of Object.entries(vulnerabilities)) {
    assert.equal(finding.isDirect, false, `${label} audit finding ${name} became a direct dependency`);
    assert.equal(finding.severity, 'high', `${label} audit finding ${name} changed severity`);
    assert.equal(finding.fixAvailable, true, `${label} audit finding ${name} no longer reports an upstream fix path`);
  }
  return {
    label,
    findings: [...names].sort(),
    high: Number(report.metadata?.vulnerabilities?.high || 0),
    critical: Number(report.metadata?.vulnerabilities?.critical || 0)
  };
}

const results = [
  productionAudit('root'),
  productionAudit('functions', 'functions')
];

console.log(JSON.stringify({
  ok: true,
  review: 'docs/RELEASE_4_1_SECURITY_REVIEW.md',
  results
}, null, 2));

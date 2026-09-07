#!/usr/bin/env node
'use strict';
// Explicit staging-only provisioning. Never inherits the CLI's active project.
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const globalModules = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const cli = createRequire(path.join(globalModules, 'firebase-tools/package.json'));
const { Client, getAccessToken } = cli('./lib/apiv2');
const auth = cli('./lib/auth');
const { requireAuth } = cli('./lib/requireAuth');
const PROJECT = 'we3d-staging-20260712';
const NUMBER = '524178734996';
const REGION = 'us-central1';
const SOURCE_BUCKET = `${PROJECT}-capture-build`;
const IMAGE = `${REGION}-docker.pkg.dev/${PROJECT}/capture-processing/meshroom:2023.3.0-v4`;
const client = (urlPrefix) => new Client({ urlPrefix, auth: true });

async function ensure(url, route, createRoute, body, options) {
  try { return (await client(url).get(route)).body; }
  catch (e) { if (e.status !== 404 && e.status !== 403) throw e; }
  return (await client(url).post(createRoute, body, options)).body;
}
async function grant(url, getRoute, setRoute, member, role, storage = false) {
  const c = client(url);
  const policy = url.includes('cloudresourcemanager') ? (await c.post(getRoute, {})).body : (await c.get(getRoute)).body;
  policy.bindings ||= [];
  let binding = policy.bindings.find(b => b.role === role && !b.condition);
  if (!binding) { binding = { role, members: [] }; policy.bindings.push(binding); }
  if (binding.members.includes(member)) return;
  binding.members.push(member);
  if (storage) await c.put(setRoute, policy); else await c.post(setRoute, { policy });
}

async function provision() {
  const iam = 'https://iam.googleapis.com';
  for (const id of ['capture-worker', 'capture-build']) {
    await ensure(iam, `/v1/projects/${PROJECT}/serviceAccounts/${id}@${PROJECT}.iam.gserviceaccount.com`,
      `/v1/projects/${PROJECT}/serviceAccounts`, { accountId: id, serviceAccount: { displayName: `Reality Capture ${id}` } });
  }
  await ensure('https://storage.googleapis.com', `/storage/v1/b/${SOURCE_BUCKET}`, '/storage/v1/b', {
    name: SOURCE_BUCKET, location: REGION, iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: 'enforced' },
    lifecycle: { rule: [{ action: { type: 'Delete' }, condition: { age: 7 } }] }
  }, { queryParams: { project: PROJECT } });
  const repo = `/v1/projects/${PROJECT}/locations/${REGION}/repositories/capture-processing`;
  await ensure('https://artifactregistry.googleapis.com', repo, `/v1/projects/${PROJECT}/locations/${REGION}/repositories`,
    { format: 'DOCKER', description: 'Private staging reconstruction worker' }, { queryParams: { repositoryId: 'capture-processing' } });
  const builder = `serviceAccount:capture-build@${PROJECT}.iam.gserviceaccount.com`;
  await grant('https://storage.googleapis.com', `/storage/v1/b/${SOURCE_BUCKET}/iam`, `/storage/v1/b/${SOURCE_BUCKET}/iam`, builder, 'roles/storage.objectViewer', true);
  await grant('https://artifactregistry.googleapis.com', repo + ':getIamPolicy', repo + ':setIamPolicy', builder, 'roles/artifactregistry.writer');
  await grant('https://cloudresourcemanager.googleapis.com', `/v1/projects/${PROJECT}:getIamPolicy`, `/v1/projects/${PROJECT}:setIamPolicy`, builder, 'roles/logging.logWriter');
  await grant('https://cloudresourcemanager.googleapis.com', `/v1/projects/${PROJECT}:getIamPolicy`, `/v1/projects/${PROJECT}:setIamPolicy`,
    `serviceAccount:service-${NUMBER}@gcp-sa-firebasestorage.iam.gserviceaccount.com`, 'roles/firebaserules.firestoreServiceAgent');
  // The parser/reconstruction account receives no storage or database roles.
  console.log('Staging build infrastructure configured; worker has no project data roles.');
}

async function build() {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'we3d-capture-build-'));
  try {
    const archive = path.join(work, 'source.tgz');
    execFileSync('tar', ['-czf', archive, 'scripts/reality-capture', 'functions/reality-capture-glb.js'], { cwd: root });
    const bytes = await fs.readFile(archive);
    const name = `source-${require('node:crypto').createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.tgz`;
    const token = await getAccessToken();
    const upload = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${SOURCE_BUCKET}/o?uploadType=media&name=${name}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/gzip' }, body: bytes
    });
    if (!upload.ok) throw Error(`build_source_upload_${upload.status}`);
    const result = await client('https://cloudbuild.googleapis.com').post(`/v1/projects/${PROJECT}/builds`, {
      source: { storageSource: { bucket: SOURCE_BUCKET, object: name } },
      steps: [{ name: 'gcr.io/cloud-builders/docker', args: ['build', '-f', 'scripts/reality-capture/Dockerfile.runtime', '-t', IMAGE, '.'] }],
      images: [IMAGE], timeout: '1200s', serviceAccount: `projects/${PROJECT}/serviceAccounts/capture-build@${PROJECT}.iam.gserviceaccount.com`,
      options: { logging: 'CLOUD_LOGGING_ONLY' }
    });
    console.log(JSON.stringify({ operation: result.body.name, buildId: result.body.metadata?.build?.id, image: IMAGE }));
  } finally { await fs.rm(work, { recursive: true, force: true }); }
}

async function deployJob() {
  const job = `/v2/projects/${PROJECT}/locations/${REGION}/jobs/capture-meshroom`;
  const body = { name: job.slice(4), template: { taskCount: 1, parallelism: 1, template: {
    serviceAccount: `capture-worker@${PROJECT}.iam.gserviceaccount.com`, timeout: '1800s', maxRetries: 0,
    gpuZonalRedundancyDisabled: true, nodeSelector: { accelerator: 'nvidia-l4' },
    containers: [{ image: IMAGE, resources: { limits: { cpu: '4', memory: '16Gi', 'nvidia.com/gpu': '1' } },
      env: [{ name: 'CAPTURE_BROKER', value: `https://us-central1-${PROJECT}.cloudfunctions.net/realityCaptureWorker` }] }]
  } } };
  const c = client('https://run.googleapis.com');
  let exists = false;
  try { await c.get(job); exists = true; } catch(e) { if (e.status !== 404) throw e; }
  const { name, ...creation } = body;
  const r = exists ? await c.patch(job, body) : await c.post(`/v2/projects/${PROJECT}/locations/${REGION}/jobs`, creation, { queryParams: { jobId: 'capture-meshroom' } });
  console.log(JSON.stringify({ operation: r.body.name, job: body.name }));
  await grant('https://run.googleapis.com', job + ':getIamPolicy', job + ':setIamPolicy', `serviceAccount:${PROJECT}@appspot.gserviceaccount.com`, 'roles/run.jobsExecutorWithOverrides');
}

async function main() {
  const account = auth.getGlobalDefaultAccount();
  await requireAuth({ project: PROJECT, user: account?.user, tokens: account?.tokens });
  const action = process.argv[2];
  if (action === 'provision') await provision();
  else if (action === 'build') await build();
  else if (action === 'job') await deployJob();
  else if (action === 'status' && /^[\w-]+$/.test(process.argv[3] || '')) {
    const r = (await client('https://cloudbuild.googleapis.com').get(`/v1/projects/${PROJECT}/builds/${process.argv[3]}`)).body;
    console.log(JSON.stringify({ id: r.id, status: r.status, failure: r.failureInfo, logUrl: r.logUrl, images: r.results?.images }));
  } else throw Error('Use provision, build, job, or status BUILD_ID. Staging only.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });

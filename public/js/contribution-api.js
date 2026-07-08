import { postProtectedFunction } from './function-api.js?v=1';

function sanitizeText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStatus(value) {
  const next = String(value || 'pending').toLowerCase().trim();
  return next === 'approved' || next === 'rejected' ? next : 'pending';
}

function normalizeSubmissionFilters(options = {}) {
  return {
    status: sanitizeText(options.status || 'pending', 20).toLowerCase() || 'pending',
    editType: sanitizeText(options.editType || 'all', 40).toLowerCase() || 'all',
    search: sanitizeText(options.search || '', 80),
    limit: Math.max(1, Math.min(120, Math.floor(finiteNumber(options.limit, 60))))
  };
}

export async function submitContribution(input = {}) {
  const payload = await postProtectedFunction(
    '/submitContribution',
    input,
    { label: 'Contribution API' }
  );
  return payload || {};
}

export async function listContributionSubmissions(options = {}) {
  const payload = await postProtectedFunction(
    '/listContributionSubmissions',
    normalizeSubmissionFilters(options),
    { label: 'Contribution API' }
  );
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    summary: payload?.summary && typeof payload.summary === 'object' ? payload.summary : {},
    reviewer: payload?.reviewer && typeof payload.reviewer === 'object' ? payload.reviewer : {},
    notifications: payload?.notifications && typeof payload.notifications === 'object' ? payload.notifications : {}
  };
}

export async function getContributionModerationOverview() {
  const payload = await postProtectedFunction(
    '/getContributionModerationOverview',
    {},
    { label: 'Contribution API' }
  );
  return payload || {};
}

export async function moderateContributionSubmission(submissionId, status, decisionNote = '') {
  const payload = await postProtectedFunction(
    '/moderateContributionSubmission',
    {
      submissionId: sanitizeText(submissionId || '', 180),
      status: normalizeStatus(status),
      decisionNote: String(decisionNote || '').slice(0, 200)
    },
    { label: 'Contribution API' }
  );
  return payload || {};
}

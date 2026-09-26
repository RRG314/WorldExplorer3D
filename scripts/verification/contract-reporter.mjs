// Keep Node's actual executed cases, including generated/parameterized cases.
// A passing case count is not a feature count or production-readiness score.
export default async function* contractReporter(events) {
  const cases = [];
  let summary = null;
  for await (const event of events) {
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      const { name, file, line, column, skip, todo, details } = event.data;
      cases.push({ name, file, line, column, skip: !!skip, todo: !!todo,
        ok: event.type === 'test:pass', type: details?.type,
        durationMs: details?.duration_ms });
    }
    if (event.type === 'test:summary') summary = event.data;
  }
  yield JSON.stringify({ schemaVersion: 1, evidenceScope: 'Node component and source-contract checks only',
    readinessAuthority: false, summary, executedFiles: new Set(cases.map(row => row.file)).size,
    cases }, null, 2) + '\n';
}

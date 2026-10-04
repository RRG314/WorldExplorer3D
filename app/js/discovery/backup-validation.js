// Validate the entire file before opening a destructive replacement transaction.
// Older backups may omit optional collections, but malformed rows are never dropped.
export function validateJournalBackup(input) {
  const fail = () => { throw new TypeError('This Journal backup is incomplete, damaged, or from an unsupported version. Existing records have not been changed.'); };
  if (!input || typeof input !== 'object' || !input.profile || typeof input.profile !== 'object' || Array.isArray(input.profile)) fail();
  if (input.schemaVersion != null && (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1 || input.schemaVersion > 5)) fail();
  if (input.profile.id != null && input.profile.id !== 'local-explorer') fail();
  const data = JSON.parse(JSON.stringify(input));
  for (const [name, key, required, catalog] of [['events','eventId',true,false],['fieldGuide','catalogId',true,false],['items','instanceId',false,true],['companions','instanceId',false,true]]) {
    if (data[name] == null && !required) data[name] = [];
    if (!Array.isArray(data[name])) fail();
    const ids = new Set();
    for (const row of data[name]) {
      if (!row || typeof row[key] !== 'string' || !row[key].trim() || ids.has(row[key])) fail();
      if (catalog && (typeof row.catalogId !== 'string' || !row.catalogId.trim())) fail();
      if (row.claimId != null && (typeof row.claimId !== 'string' || !row.claimId.trim())) fail();
      ids.add(row[key]);
    }
  }
  for (const rows of [data.events,data.items]) {
    const claims = new Set();
    for (const row of rows) if (row.claimId) { if (claims.has(row.claimId)) fail(); claims.add(row.claimId); }
  }
  return data;
}

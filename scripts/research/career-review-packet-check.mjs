import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory = 'docs/career-world-integration';
const required =
  `CURRENT_SYSTEM_AUDIT EXISTING_CAREER_INVENTORY PROGRESSION_AUTHORITY_MAP GAME_DESIGN_RESEARCH CAREER_MODEL_COMPARISON CAREER_TAXONOMY GEOLOGY_MINING_RESEARCH USGS_DATA_INTEGRATION CAREER_OBJECTIVE_SYSTEM CAREER_EQUIPMENT_AND_ECONOMY EXPERIENCES_ACTIVITIES_INTEGRATION MULTIPLAYER_CAREERS PLAYER_PROGRESSION_DESIGN UI_UX_PROTOTYPES PERFORMANCE_BASELINE MIGRATION_PLAN IMPLEMENTATION_PRIORITY ACCEPTANCE_MATRIX FINAL_ARCHITECTURE_RECOMMENDATION CURRENT_ONBOARDING_AUDIT FIRST_TIME_PLAYER_JOURNEY WALKTHROUGH_STATE_AND_PERSISTENCE CAREER_SELECTION_TIMING CAREER_SPECIFIC_TUTORIALS ONBOARDING_RESEARCH NEW_PLAYER_USABILITY_RESULTS ONBOARDING_OPTION_A ONBOARDING_OPTION_B ONBOARDING_OPTION_C FIRST_SESSION_PROGRESSION ONBOARDING_IMPLEMENTATION_PLAN ONBOARDING_ACCEPTANCE_MATRIX`.split(
    ' '
  );
const files = await fs.readdir(directory),
  errors = [];
let words = 0,
  links = 0;
for (const name of required) {
  const content = await fs.readFile(path.join(directory, name + '.md'), 'utf8');
  assert(content.startsWith('# '), name);
  assert(content.split(/\s+/).length >= 180, `${name} is not a substantive review`);
}
for (const name of files.filter((f) => f.endsWith('.md'))) {
  const content = await fs.readFile(path.join(directory, name), 'utf8');
  words += content.split(/\s+/).length;
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|#|mailto:)/.test(target)) continue;
    links++;
    try {
      await fs.access(path.resolve(directory, decodeURIComponent(target.split(/[?#]/)[0])));
    } catch {
      errors.push(`${name}: missing ${target}`);
    }
  }
}
const result = {
  ok: errors.length === 0,
  requiredDocuments: required.length,
  markdownDocuments: files.filter((f) => f.endsWith('.md')).length,
  words,
  relativeLinks: links,
  errors,
  scope: 'Artifact coverage/link check only, not manual fact verification or gameplay acceptance.',
};
await fs.writeFile(
  'output/research/career-world-20261105/packet-check.json',
  JSON.stringify(result, null, 2) + '\n'
);
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;

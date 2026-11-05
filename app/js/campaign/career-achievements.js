import { miningCareerBadge } from './mining-career.js';
import { acceleratorCareerBadge } from './accelerator-career.js';
import { astronomyCareerBadge } from './astronomy-career.js';
import { cartographyCareerBadge } from './cartography-career.js';
import { meteorologyCareerBadge } from './meteorology-career.js';
import { hydrologyCareerBadge } from './hydrology-career.js';
import { marineBiologyCareerBadge } from './marine-biology-career.js';
import { oceanographyCareerBadge } from './oceanography-career.js';
import { botanyCareerBadge } from './botany-career.js';
import { wildlifeCareerBadge } from './wildlife-career.js';
import { palaeontologyCareerBadge } from './palaeontology-career.js';
import { geologyCareerBadge } from './geology-career.js';
import { archaeologyCareerBadge } from './archaeology-career.js';
import { soloRacerBadge } from './solo-racer.js';
import { homeAchievementBadges } from './home-achievements.js';
import { harborRunBadge } from './harbor-run.js';
import { threeViewsBadge } from './three-views.js';
import { openingChapterBadge } from './first-bearings.js?v=1';
// A shared read projection of the original domain awards. It writes no XP,
// inventory, receipts or career state; the domain reducers earn these awards.
export function personalCareerAchievements(profile = {}) {
  const research = profile.researchCareers || {};
  return [
    ...homeAchievementBadges(profile),
    acceleratorCareerBadge(research.accelerator),
    miningCareerBadge(research.mining),
    astronomyCareerBadge(research.astronomy),
    cartographyCareerBadge(research.cartography),
    meteorologyCareerBadge(research.meteorology),
    hydrologyCareerBadge(research.hydrology),
    oceanographyCareerBadge(research.oceanography),
    marineBiologyCareerBadge(research['marine-biology']),
    botanyCareerBadge(research.botany),
    wildlifeCareerBadge(research.wildlife),
    palaeontologyCareerBadge(research.palaeontology),
    archaeologyCareerBadge(research.archaeology),
    geologyCareerBadge(research.geology),
    soloRacerBadge(profile.soloRacer),
    openingChapterBadge(profile.openingChapter),
    harborRunBadge(profile.harborRun),
    threeViewsBadge(profile.threeViews),
  ]
    .filter(Boolean)
    .filter((row, index, rows) => rows.findIndex((other) => other.id === row.id) === index);
}

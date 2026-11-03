import {normalizeOceanographyCareer,OCEANOGRAPHY_STATIONS} from './oceanography-career.js';
import {marineCareerResumeVoyage,createMarineCareerTravel} from './marine-career-travel.js';
export const oceanographyResumeVoyage=(value,variantId,latest)=>marineCareerResumeVoyage(value,variantId,latest,normalizeOceanographyCareer);
export const createOceanographyTravel=options=>createMarineCareerTravel({...options,domainId:'oceanography',normalize:normalizeOceanographyCareer,sitesForVariant:()=>OCEANOGRAPHY_STATIONS});

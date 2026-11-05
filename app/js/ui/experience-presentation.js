import {REFERENCE_VISUALS} from '../discovery/visual-content.js?v=1';

// Display metadata only. Catalog adapters still own admission and progress.
export const EXPERIENCE_GROUPS = Object.freeze([
  {id:'all',label:'All interests'},
  {id:'land',label:'Land & life'},
  {id:'water',label:'Water & weather'},
  {id:'space',label:'Space & science'},
  {id:'motion',label:'Drive & fly'},
  {id:'create',label:'Explore & create'},
].map(Object.freeze));

const groups = {
  'harbor-run':'motion', racer:'motion', 'expedition-pilot':'motion',
  geologist:'land', archaeologist:'land', 'mining-engineer':'land', palaeontologist:'land', 'wildlife-ecologist':'land', botanist:'land',
  oceanographer:'water', 'marine-biologist':'water', hydrologist:'water', meteorologist:'water',
  'planetary-scientist':'space', astronomer:'space', 'accelerator-scientist':'space',
  cartographer:'create', 'field-engineer':'create', 'documentary-explorer':'create', explorer:'create', 'companion-handler':'create',
};
const references = {geologist:'granite', 'mining-engineer':'quartz', palaeontologist:'fossil-shells', 'wildlife-ecologist':'white-tailed-deer', botanist:'dandelion', 'companion-handler':'trail-hound'};
const gameplay = {
  'harbor-run':['driving-1b41f3116f83.webp','Driving a road delivery vehicle in mapped Baltimore','Gameplay · Road delivery'],
  racer:['driving-1b41f3116f83.webp','Driving a BMW on a mapped Baltimore street','Gameplay · Baltimore'],
  'expedition-pilot':['flight-f22b1898aa92.webp','Flying above mapped Baltimore','Gameplay · Flight'],
  oceanographer:['research-deck-40e79f50319d.webp','Walking on the research vessel deck','Gameplay · Research vessel'],
  'marine-biologist':['diving-e47bc4881b7d.webp','Diving beside the research submarine','Gameplay · Coral Shelf'],
  'documentary-explorer':['walking-a8119ad855de.webp','Exploring a mapped Baltimore street on foot','Gameplay · Baltimore'],
  explorer:['drone-cf7691b9c943.webp','Mapped Baltimore buildings seen from above','Gameplay · Baltimore'],
  astronomer:['space-fd854981b14d.webp','Navigating through the Solar System','Gameplay · Space navigation'],
};
const symbols = {archaeologist:'⌘',hydrologist:'≈',meteorologist:'☁',cartographer:'⌖','planetary-scientist':'◒','accelerator-scientist':'◎','field-engineer':'◇'};

export function experiencePresentation(entry) {
  const id=String(entry?.id||'').replace(/^(career:|activity:)/,'');
  const group=groups[id]||'all';
  const reference=REFERENCE_VISUALS[references[id]];
  const capture=gameplay[id];
  const image=reference ? {
    src:new URL('../../'+reference.image,import.meta.url).href,alt:reference.alt,
    caption:`Reference photo · ${reference.author} · ${reference.license}`,
    sourceUrl:reference.sourceUrl,
  } : capture ? {src:new URL(`../../../assets/gallery/5.6/${capture[0]}`,import.meta.url).href,alt:capture[1],caption:capture[2],sourceUrl:null} : null;
  return {group,groupLabel:EXPERIENCE_GROUPS.find(item=>item.id===group)?.label||'Activity',symbol:symbols[id]||'⌖',image};
}

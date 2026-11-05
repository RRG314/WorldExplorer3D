import { CAREER_EXPERIENCES, QUICK_EXPERIENCES } from '../../app/js/experiences/catalog.js';
import { BACKGROUND_DEFINITIONS, SPECIALTY_DEFINITIONS } from '../../app/js/character/catalog.js';
import {
  EXPERIENCE_GROUPS,
  experiencePresentation,
} from '../../app/js/ui/experience-presentation.js';
import { runNativePrototypes } from './native-prototypes.js';
import { createIntroSequence } from './intro-sequence.js';
import { createInteractiveGlobe } from './interactive-globe.js';

const $ = (s) => document.querySelector(s),
  escape = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
const asset = (name) => `../../assets/gallery/5.6/${name}`;
const captures = {
  earth: ['walking-a8119ad855de.webp', 'Gameplay · mapped Baltimore'],
  ocean: ['research-deck-40e79f50319d.webp', 'Gameplay · research vessel'],
  space: ['space-fd854981b14d.webp', 'Gameplay · Solar System navigation'],
  moon: ['ship-interior-2070577970ce.webp', 'Gameplay · ship interior; lunar departure context'],
  mars: ['space-fd854981b14d.webp', 'Gameplay · Solar System; Mars departure context'],
};
const models = {
  A: {
    title: 'Starting career + open world',
    note: 'Choose an initial interest and suggested background before entry. Every basic activity remains open; later switching keeps all earned progress.',
    home: 'Choose your first direction',
    cta: 'Choose a starting career',
    target: 'careers',
    identity: 'STARTING PATH',
  },
  B: {
    title: 'Classless specializations',
    note: 'Start exploring immediately. Skills describe what you actually practice; a career is a collection of related opportunities, not a chosen class.',
    home: 'Go somewhere. Try something.',
    cta: 'Explore the world',
    target: 'worlds',
    identity: 'PRACTICED SKILLS',
  },
  C: {
    title: 'Career-guided sandbox',
    note: 'Track one optional focus over the existing classless character. Valid activity in other fields still counts. Changing focus does not start a mission or reset the Explorer.',
    home: 'Find your next adventure',
    cta: 'Find your focus',
    target: 'careers',
    identity: 'OPTIONAL FOCUS',
  },
  D: {
    title: 'Professions + qualifications',
    note: 'Show learning pathways and evidence-backed qualifications. Basic exploration stays open. Advanced work requires original capability checks, not a new global level.',
    home: 'Build a body of work',
    cta: 'See learning pathways',
    target: 'qualifications',
    identity: 'LEARNING PATHWAY',
  },
};
const intros = {
  A: 'Pick a career → prepare → learn controls in its first task → save a result.',
  B: 'Move → try one action → save and review one result → choose a direction.',
  C: 'Choose a place → explore immediately → accept help only when requested.',
};
const s = {
  model: 'A',
  intro: 'B',
  composition: 'field',
  device: 'desktop',
  screen: 'start',
  career: 'career:geologist',
  focus: null,
  world: 'earth',
  group: 'all',
  prepared: false,
  recorded: false,
  reviewed: false,
  step: 0,
  crew: false,
  shop: false,
  notices: true,
  explorerName: 'Explorer',
  gender: 'man',
  vehicleId: 'bmw_e34',
  vehicleLabel: 'BMW 525i E34',
  setupComplete: false,
  destination: null,
};
let globeReturn = 'start';
const introFlow = createIntroSequence({
  onChange: () => render(),
  onBegin: (draft) => {
    Object.assign(s, {
      explorerName: draft.name.trim() || 'Explorer',
      gender: draft.gender,
      career: draft.careerId,
      focus: draft.careerId === 'career:explorer' ? null : draft.careerId,
      vehicleId: draft.vehicleId,
      vehicleLabel: draft.vehicleLabel,
      world: draft.destination.world,
      destination: draft.destination,
      setupComplete: true,
      prepared: true,
      screen: 'play',
    });
    render({ focus: true });
  },
});
const globe = createInteractiveGlobe({
  onUse: (place) => {
    s.destination = place;
    s.world = 'earth';
    introFlow.setDestination(place);
    s.screen = globeReturn === 'setup' ? 'setup' : 'play';
    render({ focus: true });
    $('#view').scrollIntoView({ block: 'start' });
  },
  onCancel: () => {
    s.screen = globeReturn;
    render({ focus: true });
    $('#view').scrollIntoView({ block: 'start' });
  },
});
const params = new URLSearchParams(location.search);
for (const key of ['model', 'intro', 'composition', 'device'])
  if ([...$('#' + key).options].some((o) => o.value === params.get(key))) s[key] = params.get(key);
const career = () => CAREER_EXPERIENCES.find((c) => c.id === s.career) || CAREER_EXPERIENCES[1];
const button = (text, screen, cls = '') =>
  `<button class="${cls}" data-screen="${screen}">${text}</button>`;
const action = (text, id, cls = '') =>
  `<button class="${cls}" data-action="${id}">${text}</button>`;
function hero(
  title,
  description,
  { eyebrow = 'YOUR WORLD. YOUR EXPLORER.', image, actions = '' } = {}
) {
  const c = captures[s.world];
  return `<section class="hero"><img src="${image?.src || asset(c[0])}" alt="${escape(image?.alt || c[1])}"><div class="hero-copy"><span class="eyebrow">${eyebrow}</span><h1>${escape(title)}</h1><p>${escape(description)}</p><div class="actions">${actions}</div></div><span class="credit">${escape(image?.caption || c[1])}${image?.sourceUrl ? ` · <a href="${escape(image.sourceUrl)}" target="_blank" rel="noreferrer">Source ↗</a>` : ''}</span></section>`;
}
const heading = (tag, title, p = '') =>
  `<div class="section-heading"><div><span class="eyebrow">${tag}</span><h2>${title}</h2></div>${p ? `<p>${p}</p>` : ''}</div>`;
const card = (title, body, buttons = '', label = '') =>
  `<article class="card">${label ? `<span class="eyebrow">${label}</span>` : ''}<h3>${title}</h3><p>${body}</p>${buttons}</article>`;
function mapScene() {
  return `<div class="map-scene"><img src="${asset('research-map-76bc4c68afc2.webp')}" alt="Actual research chart gameplay"><svg viewBox="0 0 600 430" role="img" aria-label="Schematic three-stop training route, not real map coordinates"><path d="M110 310 Q160 210 280 225 T465 100" fill="none" stroke="#172b30" stroke-width="15"/><path d="M110 310 Q160 210 280 225 T465 100" fill="none" stroke="#ffa570" stroke-width="5" stroke-dasharray="8 7"/>${[
    [110, 310, 'A'],
    [280, 225, 'B'],
    [465, 100, 'C'],
  ]
    .map(
      ([x, y, l]) =>
        `<circle cx="${x}" cy="${y}" r="19" fill="#ff965e"/><text x="${x}" y="${y + 5}" text-anchor="middle" fill="#172022" font-size="16">${l}</text>`
    )
    .join(
      ''
    )}</svg><div class="map-label"><span class="eyebrow">TRAINING ROUTE · SCHEMATIC</span><h3>One task at a time</h3><small>Map context → field evidence → review</small></div><span class="map-caption">Gameplay chart + illustrative route; not live survey coordinates</span></div>`;
}
function start() {
  const journeys = [
    [
      'RACE THE ROADS',
      'Racing & driving',
      'Choose a real car, find an event, or create a clean course of your own.',
      'driving-1b41f3116f83.webp',
      'career:racer',
    ],
    [
      'FOLLOW YOUR CURIOSITY',
      'Fieldwork & discovery',
      'Read the landscape, uncover the past, and keep a record of what you learn.',
      'museum-ec196f05eadc.webp',
      'career:geologist',
    ],
    [
      'GO BELOW THE SURFACE',
      'Oceans & marine life',
      'Board a research vessel, explore underwater, and return with a story.',
      'diving-e47bc4881b7d.webp',
      'career:oceanographer',
    ],
    [
      'LOOK BEYOND EARTH',
      'Space & the night sky',
      'Navigate the Solar System and prepare for supported planetary fieldwork.',
      'space-fd854981b14d.webp',
      'career:planetary-scientist',
    ],
  ];
  return `<section class="landing-hero"><img src="${asset('drone-cf7691b9c943.webp')}" alt="Actual World Explorer gameplay above mapped Baltimore"><div class="landing-hero-copy"><span class="eyebrow">ONE EXPLORER. A WORLD OF POSSIBILITIES.</span><h1>Make the world<br>your next story.</h1><p>Choose who you are. Find what moves you. Start on familiar streets, head out to sea, or set your sights beyond Earth.</p><div class="actions">${action('Start your journey →', 'start-journey', 'primary')}${s.setupComplete ? button(`Continue as ${escape(s.explorerName)}`, 'play', 'quiet') : button('Explore freely', 'worlds', 'quiet')}</div><small>Character → Career → First car → Begin</small></div><span class="landing-image-credit">Actual gameplay · mapped Baltimore</span></section>
  <section class="landing-worlds"><div><span class="eyebrow">CHOOSE YOUR HORIZON</span><h2>A globe. An ocean. A sky full of places.</h2></div><div class="world-destinations">${[
    ['earth', 'earth.jpg', 'Earth', 'Cities, roads & landscapes'],
    ['moon', 'moon.jpg', 'Moon & Mars', 'Planetary exploration'],
    ['space', 'space.jpg', 'Space', 'Stars, planets & journeys'],
    ['ocean', 'ocean-gameplay-20261104.png', 'Ocean', 'Vessels, reefs & research'],
  ]
    .map(
      ([id, img, name, sub]) =>
        `<button data-landing-world="${id}"><img src="../../app/assets/textures/ui-thumbnails/${img}" alt="${name}"><strong>${name}</strong><small>${sub}</small></button>`
    )
    .join('')}</div>${button('Open the globe selector ↗', 'worlds')}</section>
  <section class="landing-experiences"><div class="section-heading"><div><span class="eyebrow">FIND YOUR KIND OF ADVENTURE</span><h2>More than one way to explore.</h2></div>${button('See all careers', 'careers', 'quiet')}</div><div class="landing-feature-grid">${journeys.map(([tag, title, body, img, id]) => `<button class="landing-feature" data-career="${id}"><img src="${asset(img)}" alt="Actual ${title.toLowerCase()} gameplay"><span><small class="eyebrow">${tag}</small><strong>${title}</strong><p>${body}</p><em>Discover more ↗</em></span></button>`).join('')}</div></section>
  <section class="landing-create"><img src="${asset('research-interior-cf113dcb5303.webp')}" alt="Actual game research interior"><div><span class="eyebrow">MAKE SOMETHING WORTH RETURNING TO</span><h2>A place of your own.<br>A journey to share.</h2><p>Build a useful workspace, create a route or track, keep an album, and meet other Explorers in shared rooms.</p><div class="actions">${button('Create & build', 'home', 'primary')}${button('Explore together', 'crew')}</div></div></section>
  <section class="landing-return"><div><span class="eyebrow">ALREADY AN EXPLORER?</span><h2>Your story keeps going.</h2><p>Return to your Journal, tools, vehicles and unfinished work. Choose a new direction whenever you like.</p></div><div class="actions">${button('Continue exploring', 'returning', 'primary')}${button('Open Journal', 'journal')}</div></section>`;
}
function worlds() {
  const contexts = `<div class="destination-contexts" aria-label="Choose a world">${[
    ['earth', 'earth.jpg', 'Earth'],
    ['moon', 'moon.jpg', 'Moon'],
    ['mars', 'mars.jpg', 'Mars'],
    ['space', 'space.jpg', 'Space'],
    ['ocean', 'ocean-gameplay-20261104.png', 'Ocean'],
  ]
    .map(
      ([id, image, label]) =>
        `<button data-world="${id}" aria-pressed="${s.world === id}"><img src="../../app/assets/textures/ui-thumbnails/${image}" alt="">${label}</button>`
    )
    .join('')}</div>`;
  return (
    contexts +
    (s.world === 'earth'
      ? '<div data-globe-host></div>'
      : hero(
          s.world === 'ocean'
            ? 'The ocean awaits'
            : s.world === 'moon'
              ? 'Beyond Earth'
              : 'A sky full of places',
          'Explore this environment, or return to Earth to choose any point on the globe.',
          {
            actions:
              button('Continue to this world', 'play', 'primary') +
              '<button data-world="earth">Choose a place on Earth</button>',
          }
        ))
  );
}

function careers() {
  return `<div class="content">${heading('ONE EXPLORER · ALL INTERESTS', s.model === 'B' ? 'Discover through practice' : 'Choose a direction', 'This selection guides the preview only. Actual availability still belongs to each original activity adapter.')}<div class="chip-row">${EXPERIENCE_GROUPS.map((g) => `<button data-group="${g.id}" aria-pressed="${s.group === g.id}">${g.label}</button>`).join('')}</div><div class="cards career-grid">${CAREER_EXPERIENCES.filter(
    (c) => s.group === 'all' || experiencePresentation(c).group === s.group
  )
    .map((c) => {
      const p = experiencePresentation(c);
      return `<button class="career-card ${s.career === c.id ? 'selected' : ''}" data-career="${c.id}">${p.image ? `<img src="${p.image.src}" alt="${escape(p.image.alt)}">` : `<span class="symbol" aria-hidden="true">${p.symbol}</span>`}<span class="copy"><span class="eyebrow">${p.groupLabel}</span><h3>${c.label}</h3><small>${c.assignment}</small><small>${p.image?.caption || 'Original activity · no representative photo'}</small></span></button>`;
    })
    .join('')}</div>${button('Explore without choosing', 'worlds')}</div>`;
}
function careerDetail() {
  const c = career(),
    p = experiencePresentation(c);
  return (
    hero(c.label, c.summary, {
      eyebrow: c.assignment,
      image: p.image,
      actions:
        action('Start with this career →', 'career-journey', 'primary') +
        button('Back to all interests', 'careers'),
    }) +
    `<div class="content"><div class="split"><div class="stack">${heading('FIRST PLAYABLE WORK', c.assignment)}<ol class="step-list"><li>Review the place, tools and original activity requirements.</li><li>Start the actual assignment through its existing entry.</li><li>Do the work in the world, then review its saved record.</li></ol><div class="notice">${c.id === 'career:expedition-pilot' ? 'Harbor Run currently starts with a road delivery. A complete aviation profession is a future extension.' : c.id === 'career:mining-engineer' ? 'A fictional quarry training yard. Map references do not create deposits, land rights or extraction permission.' : 'Existing gameplay stays with its original owner. A focus changes guidance, not the rules of the world.'}</div></div><div class="stack">${card('What carries across', 'One character, Backpack and Journal. Your other studies and travel are kept.', button('See shared progress', 'progress'))}${card('Prepare first', 'The course may provide instruments. Other equipment remains in your existing Backpack and stores.', button('Inspect your kit', 'kit'))}${card('Your starting character', 'Background and interests are separate. Existing players never receive a forced replacement.', button('See backgrounds', 'identity'))}</div></div></div>`
  );
}
function identity() {
  return `<div class="content">${heading('CHARACTER · ORIGINAL BACKGROUNDS', 'Who is your Explorer?', 'Eight existing backgrounds use one attribute budget. A focus never recreates this character.')}<div class="cards">${BACKGROUND_DEFINITIONS.map((b) => card(b.label, b.summary, `<small>Suggested tools: ${escape(b.recommendedToolIds.join(', ') || 'Activity provides preparation')}</small>`, b.id)).join('')}</div><div class="notice">This is a read-only comparison. Attribute creation, skill awards and appearance keep their existing owners.</div>${button('Continue with one Explorer', 'kit', 'primary')}</div>`;
}
function kit() {
  return `<div class="content">${heading('ONE BACKPACK', 'Prepare for the next task', 'Recommended equipment is a view of existing items; choosing a career does not mint a second kit.')}<div class="split"><div class="stack"><article class="card"><h3>Field essentials</h3><label class="check-line"><input id="prepared" type="checkbox" ${s.prepared ? 'checked' : ''}>Check the required tools</label><div class="data-row"><span>Field lens</span><span class="pill">Existing tool</span></div><div class="data-row"><span>Field camera</span><span class="pill">Existing tool</span></div><div class="data-row"><span>Course instruments</span><span>Provided where supported</span></div><small>No purchase is required for First Journey.</small></article>${button(s.prepared ? 'Continue to task' : 'Review the first task', 'play', 'primary')}</div>${card('When something is missing', 'Show the exact missing tool and the original shop or course-provided option. Never a new career wallet.', button('Visit equipment view', 'store'))}</div></div>`;
}
function play() {
  const c = career();
  const focus = s.focus
    ? CAREER_EXPERIENCES.find((c) => c.id === s.focus)?.label
    : 'Free exploration';
  const objectives =
    c.id === 'career:racer' && s.focus
      ? [
          'Review your selected car in the Garage',
          'Choose a supported event and finish your first race',
          'Keep the result and review your car’s condition',
        ]
      : s.world === 'ocean'
        ? [
            'Review the vessel chart',
            'Use the provided instrument at a station',
            'Return and compare the records',
          ]
        : s.world === 'space' || s.world === 'moon'
          ? [
              'Check the mission and return reserve',
              'Compare supported field observations',
              'Return to the ship and review',
            ]
          : [
              'Approach the offered field lead',
              'Use its actual interaction and finish the work',
              'Record and review the result',
            ];
  return (
    hero(
      s.destination?.world === s.world
        ? s.world === 'earth' && !Number.isFinite(s.destination.lat)
          ? 'Your Earth journey'
          : s.destination.name
        : s.world === 'earth'
          ? 'Choose your starting place'
          : s.world === 'ocean'
            ? 'Coral Shelf'
            : 'Solar System',
      s.setupComplete
        ? `${s.explorerName} · ${focus} · ${s.vehicleLabel}. Follow your first chapter, or explore at your own pace.`
        : 'The world stays in view. One deliberate objective; everything else is in the menu.',
      {
        eyebrow: focus,
        actions: action('Preview a result', 'record', 'primary') + button('Change focus', 'switch'),
      }
    ) +
    (s.destination?.world === 'earth' &&
    Number.isFinite(s.destination.lat) &&
    Number.isFinite(s.destination.lon)
      ? `<div class="content"><p>Selected starting place · ${escape(s.destination.name)} · ${Number(s.destination.lat).toFixed(5)}, ${Number(s.destination.lon).toFixed(5)}</p>${button('Change starting place', 'worlds')}</div>`
      : '') +
    `<div class="goal-strip"><div><span class="eyebrow">${s.recorded ? 'RESULT AVAILABLE' : 'CURRENT TASK'}</span><h3>${s.focus ? c.assignment : 'First Bearings'}</h3><p>${objectives[Math.min(s.step, 2)]}</p></div>${action('Next instruction', 'step')}</div><div class="content"><div class="split">${s.composition === 'atlas' ? mapScene() : `<article class="card"><span class="eyebrow">${s.composition === 'desk' ? 'FIELD NOTES' : 'YOUR NEXT STEP'}</span><h2>${s.recorded ? 'A result to keep' : 'Do one thing well'}</h2><ol class="step-list">${objectives.map((l, i) => `<li class="${s.step > i ? 'done' : ''}">${l}</li>`).join('')}</ol><small>Preview controls illustrate sequencing; real gameplay is in the app.</small></article>`}<div class="stack">${card('Travel', 'Walk, Drive, Drone, Fly or supported water and space controls follow the current environment.', button('Review travel modes', 'travel'))}${card('Quiet help', 'A small help control opens the current action. No flashing ambient banners.', button('Controls & help', 'controls'))}</div></div></div>`
  );
}
function intro() {
  return (
    hero(
      s.intro === 'A'
        ? 'A start that feels yours'
        : s.intro === 'B'
          ? 'Your first bearings'
          : 'The world is open',
      intros[s.intro],
      {
        actions:
          s.intro === 'A'
            ? button('Pick your first interest', 'careers', 'primary')
            : button('Enter the world', 'play', 'primary'),
      }
    ) +
    `<div class="content"><div class="split"><article class="card"><span class="eyebrow">OPTION ${s.intro} · FIRST SESSION</span><h2>${s.intro === 'A' ? 'Choose → prepare → do' : s.intro === 'B' ? 'Move → do → keep' : 'Explore → ask → discover'}</h2><ol class="step-list">${(s.intro === 'A' ? ['Choose any interest or Free Explorer', 'Inspect the offered tools and place', 'Learn controls through the first real task', 'Keep its Journal record and choose what comes next'] : s.intro === 'B' ? ['Move and look in the selected world', 'Try one valid nearby action', 'Finish an activity and record its result', 'Review the Journal, then choose an interest'] : ['Choose a place and enter freely', 'Open optional help when you want it', 'Pick one activity from the menu', 'Keep any valid result without a compulsory lesson']).map((l) => `<li>${l}</li>`).join('')}</ol></article>${card('Always optional', 'Skip now, resume later or replay instructions. Replaying a lesson never resets items, achievements or missions.', button('Skip to free exploration', 'worlds'))}</div></div>`
  );
}
function progress() {
  return `<div class="content">${heading('PRACTICE · EVIDENCE · IDENTITY', 'Your Explorer grows', 'Story milestones, practical skills and individual course records have different jobs. No second career level is proposed.')}<div class="split"><div class="stack">${SPECIALTY_DEFINITIONS.map((d, i) => `<article class="inset"><div class="data-row"><strong>${d.label}</strong><span>${s.recorded && ['geology', 'space'].includes(d.id) ? 'Preview practice' : 'Available to practice'}</span></div><div class="meter"><span style="width:${s.recorded && ['geology', 'space'].includes(d.id) ? 58 : 12 + i * 2}%"></span></div><small>Illustrative progress only · not your saved XP</small></article>`).join('')}</div><div class="stack">${card('Practice follows the work', 'A planetary geology observation can improve Space and Geology from one canonical event. The sample is still one item.', action('Preview shared result', 'record', 'primary'))}${card('Qualifications', 'Capabilities are explained through their real prerequisites. Advanced tools do not lock basic exploration.', button('See qualification view', 'qualifications'))}${card('A continuing story', 'Journal records, reports, photographs and places make the progress understandable.', button('Open Journal', 'journal'))}</div></div></div>`;
}
function qualifications() {
  return `<div class="content">${heading('EVIDENCE BEFORE TITLES', 'Learning pathways', 'Model D makes qualifications prominent. In the other models this is optional detail, using existing capability checks.')}<div class="cards">${card('Field foundations', 'Basic inspection, photography and surveying remain open. Use real saved work to explain advancement.', button('Prepare a basic task', 'kit', 'primary'), 'OPEN')}${card('Advanced dive readiness', 'Show the existing qualification requirement and supported equipment. Do not sell a made-up credential.', button('Review equipment', 'kit'), 'CHECK ORIGINAL CAPABILITY')}${card('Specialist work', 'Follow completed courses and practical skills. New advanced jobs require content, evidence and acceptance first.', button('View practice record', 'progress'), 'PROPOSED PRESENTATION')}</div><div class="notice">No new universal profession rank, certificate currency or global exploration lock.</div></div>`;
}
function geology() {
  return (
    hero(
      'Read the landscape',
      'Published maps provide context. The rocks you examine in an authored training course are separate evidence.',
      {
        image: experiencePresentation(CAREER_EXPERIENCES[1]).image,
        actions:
          button('Prepare fieldwork', 'kit', 'primary') + button('See virtual mining', 'mining'),
      }
    ) +
    `<div class="content"><div class="split">${mapScene()}<div class="stack"><article class="card"><span class="eyebrow">ACTUAL PUBLIC POINT QUERY · BALTIMORE</span><h3>Lowland deposits</h3><p>Sand and gravel of unspecified origin · Quaternary</p><small>Cleaves, Edwards & Glaser, 1968 · Maryland map · 1:250,000. Provider confidence: Medium.</small><div class="notice">Mapped unit. Surface exposure, mineral occurrence, ownership and extraction permission are not established.</div></article>${card('An honest discovery chain', 'Observe → compare → document. A map does not generate collectible ore. Historical mines and assessments are separate future reference layers.', button('See evidence in Journal', 'journal'))}</div></div></div>`
  );
}
function mining() {
  return `<div class="content">${heading('VIRTUAL TRAINING YARD', 'From vein to material', 'The existing fictional quarry teaches supported work, sampling, sorting and restoration. Real mine markers never authorize extraction.')}<div class="split"><article class="card"><h2>Plan. Work. Restore.</h2><ol class="step-list">${['Qualify a safe authored site and inspect its face', 'Core and assay before choosing a cut', 'Separate labeled material from waste', 'Restore the yard and report the work'].map((l) => `<li>${l}</li>`).join('')}</ol>${button('Review equipment', 'kit', 'primary')}</article><div class="stack">${card('Geology can inform the work', 'Reference maps and observations help interpretation. They are not a guaranteed deposit, claim or legal permission.', button('Read map context', 'geology'))}${card('One material economy', 'Existing Backpack items and authorized transfers feed fabrication. Research specimens stay under their custody rules.', button('Materials and equipment', 'store'))}</div></div></div>`;
}
function store() {
  return `<div class="content">${heading('EXISTING STORES · EXISTING WALLET', 'Get what the task needs', 'A career shows useful existing goods. Purchase, delivery, repair and refunds remain with the original commerce authority.')}<div class="cards">${card('Inspect your carried tools', 'Show owned items first. Course-provided instruments need no purchase.', button('Backpack', 'kit', 'primary'))}${card('Request equipment', 'Preview a missing-tool request. This never spends credits or grants items.', action(s.shop ? 'Request noted in preview' : 'Preview equipment request', 'shop'))}${card('Carry useful material', 'Game-world feedstock transfers retain mass, ownership and settlement receipts. A reference rock unit has no trade value.', button('See virtual mining', 'mining'))}</div>${s.shop ? '<div class="notice" role="status">Preview request recorded. No purchase, wallet transaction or item delivery occurred.</div>' : ''}</div>`;
}
function experiences() {
  return `<div class="content">${heading('DO SOMETHING HERE', 'Activities, with a place', 'Career guidance suggests a direction; an experience is the actual work you start. Travel mode is a separate control.')}<div class="tabs">${button('Career assignments', 'careers')}${button('Free exploration', 'worlds')}${button('Join others', 'crew')}</div><div class="cards">${QUICK_EXPERIENCES.slice(
    0,
    6
  )
    .map((c) => card(c.label, c.summary, button('Review play layout', 'play'), c.kind))
    .join(
      ''
    )}</div><div class="notice">The preview keeps the current five top-level destinations in the menu. Alternatives are compared in EXPERIENCES_ACTIVITIES_INTEGRATION.md; production navigation is unchanged.</div></div>`;
}
function crew() {
  return (
    hero(
      'Different skills. Same world.',
      'Choose your own focus in a shared room. Joining, permissions and world origin stay with the existing multiplayer system.',
      { actions: action(s.crew ? 'Leave preview crew' : 'Join preview crew', 'crew', 'primary') }
    ) +
    `<div class="content"><div class="split"><article class="card"><span class="eyebrow">${s.crew ? 'PREVIEW CREW · TWO EXPLORERS' : 'SHARED ROOM CONCEPT'}</span><h2>A place to work together</h2><div class="data-row"><span>You · ${s.focus ? career().label : 'Free Explorer'}</span><span class="pill">Personal Journal</span></div><div class="data-row"><span>Teammate · Documentary explorer</span><span class="pill">Personal Journal</span></div><p>A shared route can connect observation and documentation. A new joint research mission and contribution payout are future work, not an existing feature.</p></article>${card('Separate credit, shared context', 'No copied samples or automatic wallet rewards. Native prototypes test room-frame validity and personal receipts; connected co-op acceptance follows approval.', action('Inspect native contracts', 'native'))}</div></div>`
  );
}
function journal() {
  return `<div class="content">${heading('YOUR EXPLORER STORY', 'Journal', 'Saved on this device is different from an account-acknowledged item receipt. The full Journal is not currently a cloud backup.')}<div class="split"><div class="stack">${s.recorded ? `<article class="result-banner"><span class="eyebrow">PREVIEW RECORD · NOT SAVED GAMEPLAY</span><h2>One finding, several connections</h2><p>One canonical sample → Geology + Space practice → one Backpack item.</p><small>Native controlled fixture verifies this ownership path. The visual example adds no actual progress.</small></article>` : card('Your story begins with something you do', 'Finish an actual activity in the app to create a real record. This preview can show how that result will be presented.', action('Show a preview result', 'record', 'primary'))}<article class="journal-entry"><span class="seal">⌖</span><div><h3>First Bearings</h3><small>Example sequence · move → work → record → review</small><p>See the result, its source, location, custody and the next meaningful choice.</p>${action(s.reviewed ? 'Preview record reviewed' : 'Review preview record', 'review')}</div></article>${s.reviewed ? `<div class="actions">${button('Continue this interest', 'career')}${button('Try another interest', 'switch')}${button('Roam freely', 'worlds')}</div>` : ''}</div><div class="stack">${card('Reports and albums', 'Keep authored field reports, original photographs, routes and home displays in the same story.', button('Personal workspace', 'home'))}${card('Your tools and finds', 'Items are projections of their original acquisition receipts, not separate career inventories.', button('Open Backpack', 'kit'))}</div></div></div>`;
}
function returning() {
  return (
    hero(
      'Welcome back, Explorer.',
      'Keep your places, studies, tools, homes, vehicles and journeys. Choose guidance only when you want it.',
      {
        actions:
          button('Continue exploring', 'play', 'primary') +
          button('Choose optional focus', 'careers'),
      }
    ) +
    `<div class="content"><div class="cards">${card('Your character stays yours', 'No forced creation screen, starting kit re-grant or level reset.', button('See shared progress', 'progress'))}${card('Your journey is kept', 'A new focus never cancels a transfer, abandons a study or moves your room.', button('Review travel', 'travel'))}${card('Help is optional', 'Continue, skip or replay instructions. A replay changes the lesson, not your save.', button('Learning controls', 'controls'))}</div></div>`
  );
}
function travel() {
  return `<div class="content">${heading('MOVEMENT FOLLOWS THE WORLD', 'Choose a travel mode', 'The original travel controller validates context, vehicle ownership, equipment and active journeys.')}<div class="chip-row">${Object.entries(
    { earth: 'Earth', ocean: 'Ocean', space: 'Space', moon: 'Planetary surface' }
  )
    .map(([id, l]) => `<button data-world="${id}" aria-pressed="${s.world === id}">${l}</button>`)
    .join(
      ''
    )}</div><div class="cards">${(s.world === 'earth' ? ['Walk', 'Drive', 'Drone', 'Fly'] : s.world === 'ocean' ? ['Research deck', 'Boat', 'Submarine', 'Swim / dive'] : s.world === 'space' ? ['Spacecraft', 'Wayfinder course', 'Supported landing'] : ['Walk', 'Rover', 'Drone', 'Return to pod']).map((m) => card(m, 'Preview the controls appropriate to this environment. Actual switching remains in the app.', button('View current play context', 'play'))).join('')}</div><div class="notice">A career choice never changes travel mode by itself. Existing Expedition and room frames take priority.</div></div>`;
}
function home() {
  return `<div class="content">${heading('KEEP SOMETHING MEANINGFUL', 'Your personal workspace', 'Use the existing included workspace and housing permissions. A career does not create a separate property owner.')}<div class="split"><img class="card-image" style="height:350px" src="${asset('research-interior-cf113dcb5303.webp')}" alt="Actual research interior gameplay; reference for a shared workspace layout">${card('A useful place, not another menu', 'Display a report, arrange a desk, keep access clear and return to the work. Furniture, collision and saves remain in the original housing system.', button('Browse Field engineer', 'careers', 'primary'))}</div></div>`;
}
function controls() {
  return `<div class="content">${heading('HELP WHEN YOU WANT IT', 'Controls & learning', 'Keep actual saved bindings in the app. These default examples explain the layout; mobile uses native touch controls.')}<div class="cards">${card('Move and look', 'Keyboard + mouse on desktop. Two separated touch controls and a contextual action on phone.', '<p><kbd>W A S D</kbd> Move · <kbd>E</kbd> Interact</p>')}${card('Switch travel', 'Use the original mode selector and supported context. Never replace an active trip silently.', '<p><kbd>F</kbd> Travel · <kbd>M</kbd> Map</p>')}${card('First Journey', s.notices ? 'Guidance is enabled for this preview.' : 'Guidance is paused in this preview.', action(s.notices ? 'Pause preview guidance' : 'Enable preview guidance', 'notices') + button('Replay introduction', 'intro'))}</div><div class="notice">Production requirements: keyboard focus, touch sizes, 200% text, reduced motion, notice duration and VR comfort. Native hardware and assistive testing still need their own acceptance.</div></div>`;
}
const screens = {
  start,
  worlds,
  careers,
  career: careerDetail,
  identity,
  kit,
  play,
  intro,
  progress,
  qualifications,
  geology,
  mining,
  store,
  experiences,
  crew,
  journal,
  returning,
  travel,
  home,
  controls,
  setup: () => introFlow.render(),
  switch: () =>
    `<div class="content">${heading('CHANGE DIRECTION · KEEP YOUR STORY', 'What interests you next?', 'A new focus never spends credits, grants duplicates or abandons an active task. Starting another activity is a separate action.')}<div class="cards">${CAREER_EXPERIENCES.filter(
      (c) => ['career:geologist', 'career:racer', 'career:oceanographer'].includes(c.id)
    )
      .map((c) =>
        card(c.label, c.assignment, `<button data-career="${c.id}">Review this focus</button>`)
      )
      .join(
        ''
      )}</div>${action('Clear focus, keep exploring', 'clear-focus')}${button('See all interests', 'careers')}</div>`,
};
const nav = [
  ['worlds', 'Explore'],
  ['careers', 'Interests & careers'],
  ['experiences', 'Activities'],
  ['journal', 'Journal'],
  ['kit', 'Backpack'],
  ['progress', 'Progress'],
  ['qualifications', 'Qualifications'],
  ['geology', 'Geology & sources'],
  ['mining', 'Virtual mining'],
  ['store', 'Equipment stores'],
  ['crew', 'Together'],
  ['home', 'Personal workspace'],
  ['travel', 'Travel'],
  ['controls', 'Controls & learning'],
];
$('#nav').innerHTML = nav.map(([id, t]) => button(t, id)).join('');
function render({ focus = false } = {}) {
  const previousIntroStep = $('#application').dataset.introStep;
  const introScroll =
    $('#view').querySelector('.intro-split,.intro-careers,.intro-departure')?.scrollTop || 0;
  for (const key of ['model', 'intro', 'composition', 'device']) $('#' + key).value = s[key];
  $('#frame').dataset.device = s.device;
  $('#frame').dataset.composition = s.composition;
  $('#comparison').textContent =
    `${models[s.model].title}: ${models[s.model].note} First session ${s.intro}: ${intros[s.intro]}`;
  $('#identityLabel').textContent =
    `ONE EXPLORER · ${s.focus ? models[s.model].identity + ': ' + career().label.toUpperCase() : 'FREE EXPLORATION'}`;
  if (s.screen !== 'setup') introFlow.dispose();
  if (s.screen !== 'worlds' || s.world !== 'earth') globe.unmount();
  $('#view').innerHTML = (screens[s.screen] || start)();
  $('#application').dataset.screen = s.screen;
  if (s.screen === 'worlds' && s.world === 'earth')
    globe.mount($('[data-globe-host]'), s.destination?.world === 'earth' ? s.destination : null);
  if (s.screen === 'setup') introFlow.mount($('#view'));
  if (s.screen === 'setup' && previousIntroStep === String(introFlow.snapshot().step)) {
    const pane = $('#view').querySelector('.intro-split,.intro-careers,.intro-departure');
    if (pane) pane.scrollTop = introScroll;
  }
  $('#application').dataset.introStep =
    s.screen === 'setup' ? String(introFlow.snapshot().step) : '';
  $('#nav').hidden = !(s.composition === 'atlas' && s.device === 'desktop' && innerWidth >= 1050);
  $('#menuBtn').setAttribute('aria-expanded', String(!$('#nav').hidden));
  if (focus) $('#view').focus({ preventScroll: true });
  const q = new URLSearchParams(
    Object.fromEntries(['model', 'intro', 'composition', 'device'].map((k) => [k, s[k]]))
  );
  q.set('screen', s.screen);
  history.replaceState(null, '', '?' + q);
}
async function native() {
  const d = $('#nativeDialog');
  if (!d.open) d.showModal();
  $('#nativeResults').textContent = 'Running original source contracts…';
  const r = await runNativePrototypes();
  $('#nativeResults').innerHTML = r.results
    .map(
      (t) =>
        `<article class="card"><span class="eyebrow">PROTOTYPE ${t.id} · ${t.status.toUpperCase()} · ${t.checks || 0} assertions</span><h3>${escape(t.title)}</h3><p>${escape(t.summary || t.error)}</p><small>${escape(t.evidence || '')}</small></article>`
    )
    .join('');
  window.nativePrototypeResult = r;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'menuBtn') {
    $('#nav').hidden = !$('#nav').hidden;
    b.setAttribute('aria-expanded', String(!$('#nav').hidden));
    return;
  }
  if (b.id === 'nativeBtn' || b.dataset.action === 'native') {
    await native();
    return;
  }
  if (b.id === 'closeNative') {
    $('#nativeDialog').close();
    return;
  }
  if (b.id === 'resetBtn') {
    Object.assign(s, {
      screen: 'start',
      focus: null,
      career: 'career:geologist',
      recorded: false,
      reviewed: false,
      prepared: false,
      step: 0,
      crew: false,
      shop: false,
      explorerName: 'Explorer',
      gender: 'man',
      vehicleId: 'bmw_e34',
      vehicleLabel: 'BMW 525i E34',
      setupComplete: false,
      destination: null,
      world: 'earth',
    });
    introFlow.reset();
    globe.reset();
    render({ focus: true });
    return;
  }
  if (s.screen === 'setup') {
    if (b.dataset.intro === 'choose-place') {
      globeReturn = 'setup';
      s.world = 'earth';
      s.screen = 'worlds';
      render({ focus: true });
      $('#view').scrollIntoView({ block: 'start' });
      return;
    }
    if (b.dataset.intro === 'exit') {
      s.screen = 'start';
      render({ focus: true });
      return;
    }
    const oldStep = introFlow.snapshot().step;
    if (introFlow.click(b)) {
      if (introFlow.snapshot().step !== oldStep) {
        $('#view').focus({ preventScroll: true });
        $('#view').scrollIntoView({ block: 'start' });
      } else
        for (const key of ['gender', 'introCareer', 'introCar', 'introGroup'])
          if (b.dataset[key])
            $('#view')
              .querySelector(
                `[data-${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${b.dataset[key]}"]`
              )
              ?.focus({ preventScroll: true });
      return;
    }
  }
  if (b.dataset.landingWorld) {
    globeReturn = s.screen;
    s.world = b.dataset.landingWorld;
    s.screen = 'worlds';
    render({ focus: true });
    return;
  }
  if (b.dataset.screen) {
    if (b.dataset.screen === 'worlds' && s.screen !== 'worlds') globeReturn = s.screen;
    s.screen = b.dataset.screen;
    render({ focus: true });
    return;
  }
  if (b.dataset.career) {
    s.career = b.dataset.career;
    s.screen = 'career';
    render({ focus: true });
    return;
  }
  if (b.dataset.group) {
    s.group = b.dataset.group;
    render();
    return;
  }
  if (b.dataset.world) {
    s.world = b.dataset.world;
    render();
    return;
  }
  const a = b.dataset.action;
  if (a === 'start-journey') {
    s.screen = 'setup';
    introFlow.restart();
    $('#view').scrollIntoView({ block: 'start' });
    return;
  }
  if (a === 'career-journey') {
    s.screen = 'setup';
    introFlow.startWithCareer(s.career);
    $('#view').scrollIntoView({ block: 'start' });
    return;
  }
  if (a === 'intro') s.screen = 'intro';
  if (a === 'focus') {
    s.focus = s.career;
    s.screen = 'kit';
  }
  if (a === 'step') s.step = (s.step + 1) % 3;
  if (a === 'record') {
    s.recorded = true;
    s.step = 3;
    s.screen = 'journal';
  }
  if (a === 'review') {
    s.reviewed = true;
  }
  if (a === 'crew') s.crew = !s.crew;
  if (a === 'shop') s.shop = true;
  if (a === 'notices') s.notices = !s.notices;
  if (a === 'clear-focus') {
    s.focus = null;
    s.screen = 'play';
  }
  if (a) render({ focus: true });
});
document.addEventListener('input', (e) => introFlow.input(e.target));
document.addEventListener('change', (e) => {
  if (e.target.id === 'prepared') {
    s.prepared = e.target.checked;
    return;
  }
  if (['model', 'intro', 'composition', 'device'].includes(e.target.id)) {
    s[e.target.id] = e.target.value;
    if (e.target.id === 'model' || e.target.id === 'intro') s.screen = 'start';
    render();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#nativeDialog').open) {
    $('#nav').hidden = true;
    $('#menuBtn').setAttribute('aria-expanded', 'false');
    $('#menuBtn').focus();
  }
});
s.screen = Object.hasOwn(screens, params.get('screen')) ? params.get('screen') : 'start';
render();
window.render_game_to_text = () =>
  JSON.stringify({
    scope: 'design-simulation-no-game-saves',
    ...s,
    native: window.nativePrototypeResult?.ok ?? null,
    introduction: introFlow.snapshot(),
    globe: globe.snapshot(),
  });
addEventListener('pagehide', () => {
  introFlow.dispose();
  globe.unmount();
});

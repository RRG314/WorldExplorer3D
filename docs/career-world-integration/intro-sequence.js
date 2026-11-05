import { CAREER_EXPERIENCES } from '../../app/js/experiences/catalog.js';
import {
  EXPERIENCE_GROUPS,
  experiencePresentation,
} from '../../app/js/ui/experience-presentation.js';
import {
  PERSONAL_VEHICLES,
  personalVehicleById,
} from '../../app/js/transport/vehicle-garage-rules.js';
import { EXPLORER_ASSET_BY_GENDER } from '../../app/js/walking/curated-explorer-character.js?v=8';
import { PLAYER_CHARACTER_GENDERS } from '../../js/player-character-preference.js?v=1';
import { createIntroModelView } from './intro-model-view.js';

const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const starterIds = ['bmw_e34', 'bmw_m3_e46', 'porsche_carrera_4s', 'datsun_280z'];
const cars = PERSONAL_VEHICLES.filter((v) => starterIds.includes(v.id));
const steps = ['Your Explorer', 'Your direction', 'Your first car', 'Your departure'];

export function createIntroSequence({ onBegin, onChange }) {
  const draft = {
    name: '',
    gender: 'man',
    careerId: 'career:explorer',
    vehicleId: 'bmw_e34',
    step: 0,
    group: 'all',
    complete: false,
  };
  let viewer = null,
    previewAsset = '';
  const career = () =>
    CAREER_EXPERIENCES.find((c) => c.id === draft.careerId) ||
    CAREER_EXPERIENCES.find((c) => c.id === 'career:explorer');
  const vehicle = () => personalVehicleById(draft.vehicleId);
  const destination = () =>
    ['career:oceanographer', 'career:marine-biologist'].includes(draft.careerId)
      ? {
          name: 'Coral Shelf research vessel',
          world: 'ocean',
          image: 'research-deck-40e79f50319d.webp',
        }
      : ['career:planetary-scientist', 'career:astronomer'].includes(draft.careerId)
        ? {
            name:
              draft.careerId === 'career:planetary-scientist'
                ? 'Solis Reach · Moon fieldwork preparation'
                : 'Your observing station',
            world: 'space',
            image: 'space-fd854981b14d.webp',
          }
        : {
            name:
              draft.careerId === 'career:racer'
                ? 'Baltimore · Garage and race selection'
                : 'Earth · choose a compatible starting place',
            world: 'earth',
            image: 'walking-a8119ad855de.webp',
          };
  const stage = (kind, title) =>
    `<section class="intro-showroom"><div class="showroom-label"><span class="eyebrow">${kind === 'character' ? 'YOUR IN-GAME EXPLORER' : 'ORIGINAL GAME VEHICLE'}</span><h2>${escape(title)}</h2></div><div class="intro-model" data-intro-model></div><p class="model-status" data-model-status role="status">Loading the game model…</p><div class="showroom-tools"><span>Drag to rotate</span><button data-intro="rotate-left" aria-label="Rotate model left">↶</button><button data-intro="rotate-right" aria-label="Rotate model right">↷</button></div><small class="model-credit" data-model-credit></small></section>`;
  function panel() {
    if (draft.step === 0)
      return `<div class="intro-split">${stage('character', draft.gender === 'woman' ? 'Your Explorer' : 'Your Explorer')}<section class="intro-choices"><span class="eyebrow">01 / MAKE IT YOURS</span><h1>Every journey<br>starts with you.</h1><p>Choose your Explorer. Your appearance does not limit the careers you can follow.</p><label class="intro-name">Explorer name <span class="muted">Optional</span><input id="introName" autocomplete="off" maxlength="32" placeholder="Explorer" value="${escape(draft.name)}"></label><fieldset><legend>Gender</legend><div class="gender-choices">${PLAYER_CHARACTER_GENDERS.map((id) => `<button data-gender="${id}" aria-pressed="${draft.gender === id}"><span>${id === 'woman' ? '♀' : '♂'}</span>${id === 'woman' ? 'Woman' : 'Man'}${draft.gender === id ? ' <i>✓</i>' : ''}</button>`).join('')}</div></fieldset><div class="intro-hint">One Explorer for Earth, oceans and space. Your progress stays with you.</div></section></div>`;
    if (draft.step === 1)
      return `<section class="intro-careers"><div class="intro-section-heading"><div><span class="eyebrow">02 / FIND YOUR DIRECTION</span><h1>What calls to you?</h1></div><p>Start with an interest or choose Free Explorer. You can change direction later without losing your progress.</p></div><div class="chip-row">${EXPERIENCE_GROUPS.map((g) => `<button data-intro-group="${g.id}" aria-pressed="${draft.group === g.id}">${g.label}</button>`).join('')}</div><div class="intro-career-grid">${CAREER_EXPERIENCES.filter(
        (c) => draft.group === 'all' || experiencePresentation(c).group === draft.group
      )
        .sort((a, b) => Number(b.id === 'career:explorer') - Number(a.id === 'career:explorer'))
        .map((c) => {
          const p = experiencePresentation(c);
          return `<button class="intro-career-choice" data-intro-career="${c.id}" aria-pressed="${draft.careerId === c.id}">${p.image ? `<img src="${p.image.src}" alt="${escape(p.image.alt)}" loading="lazy">` : `<span class="intro-career-symbol">${p.symbol}</span>`}<span class="intro-career-copy"><strong>${c.id === 'career:explorer' ? 'Free Explorer' : c.label}</strong><small>${c.assignment}</small></span><span class="selection-mark" aria-hidden="true">${draft.careerId === c.id ? '✓' : '+'}</span></button>`;
        })
        .join(
          ''
        )}</div><aside class="intro-selection"><div><span class="eyebrow">YOUR FIRST DIRECTION</span><h3>${career().id === 'career:explorer' ? 'Free Explorer' : career().label}</h3><p>${career().summary}</p></div><span>Change anytime</span></aside></section>`;
    if (draft.step === 2)
      return `<div class="intro-split">${stage('vehicle', vehicle().label)}<section class="intro-choices"><span class="eyebrow">03 / YOUR FIRST SET OF KEYS</span><h1>Choose your<br>first car.</h1><p>A familiar way to begin on Earth. Your car stays part of the same Explorer collection when you try another career.</p><div class="intro-car-list">${cars.map((v) => `<button data-intro-car="${v.id}" aria-pressed="${draft.vehicleId === v.id}"><span><strong>${v.label}</strong><small>${v.category} · ${v.price === 0 ? 'Included starter' : `${v.price.toLocaleString()} Explorer Credits in Garage`}</small></span><span>${draft.vehicleId === v.id ? '✓' : '→'}</span></button>`).join('')}</div><p class="intro-hint">Prefer to start on foot? You can keep the included BMW and leave it parked. Water and space journeys use their own vehicles.</p></section></div>`;
    const dest = destination(),
      c = career();
    return `<section class="intro-departure"><div class="departure-image"><img src="../../assets/gallery/5.6/${dest.image}" alt="Actual ${dest.world} gameplay"><span>WORLD EXPLORER GAMEPLAY</span></div><div class="departure-copy"><span class="eyebrow">04 / READY WHEN YOU ARE</span><h1>Your world.<br>Your beginning.</h1><p>${escape(draft.name.trim() || 'Explorer')}, your first direction is ${c.id === 'career:explorer' ? 'free exploration' : escape(c.label.toLowerCase())}. Start with one real task and keep its story in your Journal.</p><div class="departure-summary"><button data-intro-edit="0"><small>EXPLORER</small><strong>${escape(draft.name.trim() || 'Explorer')} · ${draft.gender === 'woman' ? 'Woman' : 'Man'}</strong><span>Edit ↗</span></button><button data-intro-edit="1"><small>DIRECTION</small><strong>${c.id === 'career:explorer' ? 'Free Explorer' : escape(c.label)}</strong><span>Edit ↗</span></button><button data-intro-edit="2"><small>FIRST CAR</small><strong>${escape(vehicle().label)}</strong><span>Edit ↗</span></button></div><div class="first-assignment"><span class="eyebrow">YOUR FIRST CHAPTER</span><h3>${escape(c.assignment)}</h3><p>${escape(dest.name)}</p><small>Move and look → try an action → keep a result</small></div></div></section>`;
  }
  return {
    render() {
      return `<section class="intro-sequence"><header class="intro-progress"><button data-intro="exit" class="intro-exit">← Home</button><ol aria-label="Introduction progress">${steps.map((l, i) => `<li ${i === draft.step ? 'aria-current="step"' : ''} class="${i < draft.step ? 'done' : ''}"><span>${i < draft.step ? '✓' : i + 1}</span><strong>${l}</strong></li>`).join('')}</ol><span class="intro-step-count">${draft.step + 1} / 4</span></header>${panel()}<footer class="intro-bottom"><button data-intro="back" ${draft.step === 0 ? 'disabled' : ''}>← Back</button><p>${draft.step === 3 ? 'Your appearance, interests and collection stay together.' : 'Take your time. You can go back and change anything.'}</p><button class="primary" data-intro="next">${draft.step === 3 ? 'Begin journey →' : draft.step === 0 ? 'Choose a career →' : draft.step === 1 ? 'Choose your car →' : 'Review your beginning →'}</button></footer></section>`;
    },
    mount(root) {
      const node = root.querySelector('[data-intro-model]');
      if (!node) {
        viewer?.dispose();
        viewer = null;
        previewAsset = '';
        return;
      }
      const asset = draft.step === 0 ? EXPLORER_ASSET_BY_GENDER[draft.gender] : vehicle().assetId;
      try {
        viewer ||= createIntroModelView();
        viewer.mount(node, asset, draft.step === 0 ? 'character' : 'vehicle');
        previewAsset = asset;
      } catch {
        root.querySelector('[data-model-status]').textContent =
          'Model unavailable. Your selection is still ready to use.';
      }
    },
    click(button) {
      if (button.dataset.gender && PLAYER_CHARACTER_GENDERS.includes(button.dataset.gender))
        draft.gender = button.dataset.gender;
      else if (
        button.dataset.introCareer &&
        CAREER_EXPERIENCES.some((c) => c.id === button.dataset.introCareer)
      )
        draft.careerId = button.dataset.introCareer;
      else if (button.dataset.introCar && cars.some((c) => c.id === button.dataset.introCar))
        draft.vehicleId = button.dataset.introCar;
      else if (button.dataset.introGroup) draft.group = button.dataset.introGroup;
      else if (button.dataset.introEdit != null) draft.step = Number(button.dataset.introEdit);
      else if (button.dataset.intro === 'next') {
        if (draft.step === 3) {
          draft.complete = true;
          onBegin({
            ...draft,
            vehicleLabel: vehicle().label,
            destination: destination(),
            assignment: career().assignment,
          });
          return true;
        }
        draft.step++;
      } else if (button.dataset.intro === 'back') draft.step = Math.max(0, draft.step - 1);
      else if (button.dataset.intro === 'rotate-left' || button.dataset.intro === 'rotate-right') {
        viewer?.rotate(button.dataset.intro === 'rotate-left' ? -0.3 : 0.3);
        return true;
      } else return false;
      onChange();
      return true;
    },
    input(target) {
      if (target.id === 'introName') draft.name = target.value.slice(0, 32);
    },
    snapshot: () => ({ ...draft, previewAsset }),
    reset() {
      viewer?.dispose();
      viewer = null;
      previewAsset = '';
      Object.assign(draft, {
        name: '',
        gender: 'man',
        careerId: 'career:explorer',
        vehicleId: 'bmw_e34',
        step: 0,
        group: 'all',
        complete: false,
      });
    },
    dispose() {
      viewer?.dispose();
      viewer = null;
      previewAsset = '';
    },
    restart() {
      draft.step = 0;
      draft.complete = false;
      onChange();
    },
    startWithCareer(id) {
      if (CAREER_EXPERIENCES.some((c) => c.id === id)) draft.careerId = id;
      draft.step = 0;
      draft.complete = false;
      onChange();
    },
  };
}

import { registerUniverseRuntimeDestination, resolveUniverseAddress } from '../universe/catalog.js?v=11';
import { registerExpeditionSolidWorld } from '../planetary/solid-world-runtime.js?v=11';
import { createExpeditionArchive } from './archive.js?v=1';

function contactStellarProfile(seed) {
  return [
    { mass: 0.16, temperature: 3050, kind: 'red-dwarf', color: 0xff805b },
    { mass: 0.72, temperature: 4750, kind: 'k-star', color: 0xffbd79 },
    { mass: 0.28, temperature: 3320, kind: 'red-dwarf', color: 0xff9169 },
    { mass: 0.52, temperature: 3920, kind: 'k-star', color: 0xffa66f }
  ][seed % 4];
}

function registerExpeditionDiscovery(discovery, options = {}) {
  const contact = discovery?.contact;
  if (!contact?.id || !Number.isInteger(Number(contact.stableSeed))) return null;
  const seed = Number(contact.stableSeed) >>> 0;
  const star = contactStellarProfile(seed);
  const radiusEarth = 0.78 + ((seed >>> 5) % 92) / 100;
  const massEarth = Math.max(0.38, radiusEarth ** 2.7);
  const orbitDays = 28 + (seed % 410);
  const semiMajorAxisAu = 0.12 + ((seed >>> 9) % 130) / 100;
  const destination = registerUniverseRuntimeDestination({
    id: contact.id,
    name: contact.designation,
    objectClass: 'planetary_system',
    parentId: 'milky-way',
    address: `universe/local-group/milky-way/expedition/${contact.id}`,
    accuracy: 'model-derived expedition contact',
    canonicalPosition: {
      frame: 'expedition-route',
      distanceLy: Math.max(0.01, Number(discovery.distanceLy || 1) * Math.max(0.05, Number(discovery.routeProgress || 0.5)))
    },
    physical: { hostMassSolar: star.mass, hostTemperatureK: star.temperature },
    visualProfile: { kind: star.kind, color: star.color, seed },
    generatedFlags: ['stable-expedition-contact', 'model-derived-appearance'],
    uncertainty: { classification: 'Survey classification remains subject to local observation.' },
    provenance: [],
    children: [{
      id: `${contact.id}-i`,
      name: `${contact.designation} I`,
      objectClass: 'exoplanet',
      radiusEarth,
      massEarth,
      orbitDays,
      semiMajorAxisAu,
      accuracy: 'model-derived expedition world',
      exploration: { landingMode: 'solid_surface', surfaceClass: contact.worldClass, surfaceAuthority: 'expedition-modeled-surface-v1' },
      uncertainty: { resourceSignature: contact.resourceSignature }
    }]
  });
  const world = resolveUniverseAddress(`${contact.id}-i`);
  registerExpeditionSolidWorld({
    ...world,
    seed,
    parentSystemId: contact.id,
    starMassSolar: star.mass,
    outpost: discovery.outpost || null,
    returnMode: options.returnMode || 'space-flight'
  });
  return destination;
}

function restoreExpeditionDiscoveries(storage = globalThis.localStorage) {
  const archive = createExpeditionArchive(storage).load();
  return archive.discoveries.map((discovery) => registerExpeditionDiscovery(discovery, { returnMode: 'space-flight' })).filter(Boolean);
}

export { registerExpeditionDiscovery, restoreExpeditionDiscoveries };

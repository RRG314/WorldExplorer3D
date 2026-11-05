// Isolated R&D contracts. Original source owners, disposable memory only.
// These fixtures do not create physical field evidence or connected rewards.
import { CAREER_EXPERIENCES, experienceById } from '../../app/js/experiences/catalog.js';
import {
  createExperienceEntry,
  createExperienceIntent,
  experienceOffer,
} from '../../app/js/experiences/entry.js';
import { createCharacter } from '../../app/js/character/model.js';
import { resolveCharacterCapability } from '../../app/js/character/capability-resolver.js';
import { createMemoryDiscoveryProfileStore } from '../../app/js/discovery/profile-store.js';
import { createBackpackModel } from '../../app/js/player/backpack-model.js';
import { projectDiscoveryItemsToBackpack } from '../../app/js/discovery/backpack-projection.js';
import {
  sameRoomEarthLocation,
  leavesRoomForEarthLocation,
  roomPoseReady,
} from '../../app/js/multiplayer/room-world-policy.js';

export async function runNativePrototypes() {
  const results = [];
  const assert = (value, message) => {
    if (!value) throw Error(message);
  };
  const check = async (id, title, fn) => {
    const began = performance.now();
    try {
      results.push({
        id,
        title,
        status: 'pass',
        ...(await fn()),
        elapsedMs: +(performance.now() - began).toFixed(2),
      });
    } catch (error) {
      results.push({ id, title, status: 'fail', error: error.message });
    }
  };
  const place = {
    id: 'public-baltimore',
    name: 'Baltimore',
    environment: 'earth',
    lat: 39.2904,
    lon: -76.6122,
  };
  const store = createMemoryDiscoveryProfileStore();
  await check('A', 'Prepare one Explorer, then validate an activity', async () => {
    const character = createCharacter({ backgroundId: 'field-prospector', now: 100 });
    await store.saveProfile((current) => ({ ...current, characterState: character }));
    const capability = resolveCharacterCapability(character, 'inspection', {
      equipmentIds: ['field-lens'],
    });
    const intent = createExperienceIntent({ experienceId: 'career:geologist', place });
    const offer = experienceOffer(experienceById(intent.experienceId), {
      place,
      profile: await store.getProfile(),
      adapter: {
        offer: () => ({
          state: capability.allowed ? 'ready' : 'needs-equipment',
          enabled: capability.allowed,
          label: 'Compare exposures',
        }),
      },
    });
    assert(offer.enabled && character.creationComplete, 'Native character/admission failed');
    assert(CAREER_EXPERIENCES.length === 20, 'Catalog changed: review inventory');
    assert((await store.listItems()).length === 0, 'A menu must not invent item grants');
    let rejected = false;
    try {
      createExperienceIntent({ experienceId: intent.experienceId, place: { ...place, lat: 999 } });
    } catch {
      rejected = true;
    }
    assert(rejected, 'Invalid geography was admitted');
    return {
      checks: 4,
      summary:
        'Existing character + capability + versioned intent. No second identity, inventory or free item grant.',
      evidence: 'Controlled adapter offer; physical study acceptance reused, not replayed.',
      characterId: character.characterId,
      entry: intent.experienceId,
    };
  });
  await check('B', 'Switch activity without resetting earned state', async () => {
    await store.updateResearchCareer('geology', {
      type: 'accept',
      revision: 0,
      runId: 'rnd-geology-preserved',
      variantId: 'campaign',
      site: {
        id: 'rnd-geology-site',
        name: 'Controlled virtual site',
        truthType: 'virtual-training-site',
        location: { lat: place.lat, lon: place.lon },
        points: {
          a: { lat: place.lat, lon: place.lon },
          b: { lat: place.lat, lon: place.lon + 0.0002 },
          bench: { lat: place.lat + 0.0001, lon: place.lon },
        },
      },
    });
    await store.recordObservation({
      claimId: 'rnd:prior-geology',
      catalogId: 'rnd-prior-rock',
      name: 'Controlled prior observation',
      family: 'rock',
      activityId: 'geology-inspect',
      regionId: 'rnd-room',
      environment: 'EARTH',
      collectedAt: 1000,
    });
    const before = await store.getProfile();
    const priorEvents = await store.listEvents();
    let identity = 'earth:public-baltimore',
      starts = 0;
    const entry = createExperienceEntry({
      readWorldIdentity: () => identity,
      launchPlace: async () => true,
      resolveAdapter: () => ({
        start: async ({ intent, isCurrent }) => {
          if (!isCurrent()) return false;
          starts++;
          await store.saveProfile((current) => ({ ...current, activeExperience: intent }));
          return true;
        },
      }),
    });
    assert(await entry.start({ experienceId: 'career:geologist', place }), 'Geology entry failed');
    assert(await entry.start({ experienceId: 'career:racer', place }), 'Racer entry failed');
    const after = await store.getProfile();
    assert(
      after.characterState.characterId === before.characterState.characterId &&
        after.characterState.characterId === 'local-explorer:primary' &&
        JSON.stringify(after.researchCareers) === JSON.stringify(before.researchCareers),
      'Switch erased progress'
    );
    assert(
      after.researchCareers.geology.active.runId === 'rnd-geology-preserved' &&
        after.characterState.specialties.geology.xp ===
          before.characterState.specialties.geology.xp &&
        JSON.stringify(await store.listEvents()) === JSON.stringify(priorEvents),
      'Switch altered prior work or earned practice'
    );
    let release;
    const wait = new Promise((r) => {
      release = r;
    });
    const stale = createExperienceEntry({
      readWorldIdentity: () => identity,
      launchPlace: async () => wait,
      resolveAdapter: () => ({
        start: () => {
          starts++;
        },
      }),
    });
    const pending = stale.start({ experienceId: 'career:geologist', place });
    stale.cancel();
    identity = 'earth:elsewhere';
    release(true);
    assert((await pending) === false && starts === 2, 'Cancelled entry installed late');
    return {
      checks: 5,
      summary:
        'Two validated entries preserve an admitted study, prior Journal evidence and earned practice; cancelled travel cannot install stale activity.',
      evidence:
        'Entry lifecycle contract with controlled adapters; no physical fieldwork, vehicle or focus migration implemented.',
      activeExperience: after.activeExperience.experienceId,
    };
  });
  await check('C', 'One sample, multiple skills, one Backpack item', async () => {
    const store = createMemoryDiscoveryProfileStore();
    const record = {
      claimId: 'rnd:planetary:sample:one',
      instanceId: 'rnd:sample:one',
      catalogId: 'rnd-virtual-rock',
      name: 'Controlled virtual rock',
      family: 'rock',
      discipline: 'earth-science',
      activityId: 'geology-inspect',
      toolId: 'field-lens',
      regionId: 'rnd-moon',
      worldIdentity: 'rnd-moon',
      environment: 'PLANETARY',
      evidenceClass: 'virtual-field-record',
      collectedAt: 1000,
    };
    const first = await store.collect(record),
      duplicate = await store.collect(record);
    const profile = await store.getProfile(),
      items = await store.listItems();
    const inventory = createBackpackModel();
    const ctx = { playerBackpackInventory: inventory }; // No durable app store: deliberately disposable.
    projectDiscoveryItemsToBackpack(ctx, items);
    projectDiscoveryItemsToBackpack(ctx, items);
    assert(first.recorded && !duplicate.recorded, 'Claim dedup failed');
    assert(
      (await store.listEvents()).length === 1 && items.length === 1,
      'Duplicate Journal or sample'
    );
    assert(
      profile.characterState.specialties.space.xp > 0 &&
        profile.characterState.specialties.geology.xp > 0,
      'Cross-career awards missing'
    );
    assert(
      inventory.snapshot().items.length === 1 && inventory.snapshot().items[0].quantity === 1,
      'Backpack projection duplicated sample'
    );
    assert(
      items[0].tradeable === false && items[0].authority === 'anonymous-local',
      'Local specimen gained server authority'
    );
    return {
      checks: 5,
      summary:
        'Native claim transaction advances Space and Geology; repeated award/projection keeps one event and item.',
      evidence: 'Controlled memory receipt, not an actual new field collection or sale.',
      itemCount: items.length,
      eventCount: (await store.listEvents()).length,
    };
  });
  await check('D', 'Preserve a returning Explorer and recover migration', async () => {
    const legacy = {
      schemaVersion: 2,
      explorerProgress: { points: 45, specialties: { earth: { points: 8 } } },
      ownerExtension: { keep: true },
      researchCareers: { futureDomain: { schemaVersion: 999, record: 'keep' } },
    };
    const returning = createMemoryDiscoveryProfileStore({
      profile: legacy,
      items: [{ instanceId: 'legacy:one', catalogId: 'legacy-rock', name: 'Legacy rock' }],
      migratedAt: 100,
    });
    const profile = await returning.getProfile(),
      backup = await returning.getCharacterMigrationBackup();
    assert(
      profile.explorerProgress.points === 45 && profile.ownerExtension.keep,
      'Legacy profile damaged'
    );
    assert(profile.researchCareers.futureDomain.record === 'keep', 'Future domain discarded');
    assert(JSON.stringify(backup.profile) === JSON.stringify(legacy), 'Migration backup changed');
    assert((await returning.listItems()).length === 1, 'Legacy item lost');
    assert(await returning.rollbackCharacterMigration(), 'Migration rollback failed');
    assert(
      (await returning.getProfile()).characterState.creationComplete === false,
      'Rollback forced new career creation'
    );
    return {
      checks: 6,
      summary:
        'Legacy progress, extension fields, future domain, item and migration backup survive. Native rollback works.',
      evidence: 'Disposable representative legacy fixture, not a live account migration.',
    };
  });
  await check('E', 'Different interests, same room frame, separate receipts', async () => {
    const room = { world: { kind: 'earth', lat: place.lat, lon: place.lon } };
    const geologist = createMemoryDiscoveryProfileStore(),
      photographer = createMemoryDiscoveryProfileStore();
    assert(
      sameRoomEarthLocation(room.world, place) && !leavesRoomForEarthLocation(room, place),
      'Shared frame mismatch'
    );
    assert(
      roomPoseReady(
        room,
        { frame: { kind: 'earth', locLat: place.lat, locLon: place.lon } },
        { playing: true, loading: false }
      ),
      'Current frame rejected'
    );
    assert(
      !roomPoseReady(
        room,
        { frame: { kind: 'earth', locLat: 0, locLon: 0 } },
        { playing: true, loading: false }
      ),
      'Foreign frame published'
    );
    for (const [participant, activityId, family] of [
      [geologist, 'geology-inspect', 'rock'],
      [photographer, 'photograph', 'wildlife'],
    ]) {
      await participant.recordObservation({
        claimId: 'rnd:shared-site:observation',
        catalogId: 'rnd-room-reference',
        name: 'Controlled site observation',
        activityId,
        family,
        environment: 'EARTH',
        regionId: 'rnd-room',
        collectedAt: 2000,
      });
      assert(
        (await participant.listEvents()).length === 1 &&
          (await participant.listItems()).length === 0,
        'Contribution created inventory or duplicate receipt'
      );
    }
    assert(
      (await geologist.getProfile()).characterState.specialties.geology.xp > 0 &&
        (await photographer.getProfile()).characterState.specialties.photography.xp > 0,
      'Individual credit lost'
    );
    return {
      checks: 6,
      summary:
        'Existing room-frame policy permits distinct personal practices with separate local Journal credit.',
      evidence:
        'Two controlled participants; no connected shared research objective or joint payout exists. Server lease checks run separately.',
    };
  });
  return {
    ok: results.every((r) => r.status === 'pass'),
    scope:
      'Native source contracts; controlled fixtures, no live writes or physical gameplay claim.',
    results,
  };
}

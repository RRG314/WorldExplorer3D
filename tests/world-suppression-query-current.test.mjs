import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalWorldModificationStore} from '../app/js/editable-world/local-store.js';

test('collision membership follows committed edits, restore, reload and reset', () => {
  const values = new Map(); let fail = false;
  const storage = {
    getItem: key => values.get(key) || null,
    removeItem: key => values.delete(key),
    setItem(key, value) { if (fail) throw Error('quota'); values.set(key, value); }
  };
  const store = createLocalWorldModificationStore({storage}); store.initialize();
  const suppress = id => ({action:'suppress_base_building', suppression:{sourceFeatureId:id}});
  assert.equal(store.isBuildingSuppressed('city', 'osm:1'), false);
  assert.equal(store.commit('city', suppress('osm:1')).committed, true);
  assert.equal(store.isBuildingSuppressed('city', 'osm:1'), true);
  assert.equal(store.isBuildingSuppressed('other-city', 'osm:1'), false);
  fail = true;
  assert.equal(store.commit('city', {action:'restore_base_building',sourceFeatureId:'osm:1'}).committed, false);
  assert.equal(store.isBuildingSuppressed('city', 'osm:1'), true);
  fail = false;
  const reloaded = createLocalWorldModificationStore({storage}); reloaded.initialize();
  assert.equal(reloaded.isBuildingSuppressed('city', 'osm:1'), true);
  reloaded.commit('city', {action:'restore_base_building', sourceFeatureId:'osm:1'});
  assert.equal(reloaded.isBuildingSuppressed('city', 'osm:1'), false);
  reloaded.commit('city', suppress('osm:2'));
  reloaded.commit('city', {action:'reset_world'});
  assert.equal(reloaded.isBuildingSuppressed('city', 'osm:2'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareProviderCredentials, setProviderCredential} from '../app/js/real-estate/provider-credentials.js';

test('legacy private keys move into the existing provider owner and only their storage entries are removed', () => {
  const stored = new Map([['attomApiKey','old-attom'],['rentcastApiKey','old-rentcast'],['player-save','keep']]);
  const config = {attom:null, rentcast:'current-rentcast', estated:null};
  assert.equal(prepareProviderCredentials(config,{readLegacy:key=>stored.get(key),removeLegacy:key=>stored.delete(key)}),config);
  assert.deepEqual(config,{attom:'old-attom',rentcast:'current-rentcast',estated:null});
  assert.deepEqual([...stored],[['player-save','keep']]);
});

test('setting and clearing optional keys never writes browser storage and reload starts without keys', () => {
  const config = {attom:null,rentcast:null,estated:null};
  assert.equal(setProviderCredential(config,'attom','  visit-only  '),true);
  assert.equal(config.attom,'visit-only');
  assert.equal(setProviderCredential(config,'attom',' '),false);
  assert.equal(config.attom,null);
  assert.throws(()=>setProviderCredential(config,'__proto__','bad'),TypeError);
  assert.deepEqual(prepareProviderCredentials({},{readLegacy:()=>null,removeLegacy:()=>{}}),{});
});

test('unavailable browser storage does not stop the existing provider owner from working', () => {
  const config = {attom:'current'};
  assert.equal(prepareProviderCredentials(config,{readLegacy:()=>{throw Error('denied');},removeLegacy:()=>{throw Error('denied');}}),config);
  assert.equal(setProviderCredential(config,'rentcast','new'),true);
  assert.deepEqual(config,{attom:'current',rentcast:'new'});
});

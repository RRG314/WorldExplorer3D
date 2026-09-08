import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsPageContext } from '../js/analytics-service.js';

test('page analytics never includes capture secrets, coordinates, queries or arbitrary paths', () => {
  const result = analyticsPageContext({ href: 'https://worldexplorer3d.io/app/capture.html?email=private@example.com#capture=secret' }, 'https://reddit.com/r/example/comments/private?token=secret');
  assert.deepEqual(result, { page_location: 'https://worldexplorer3d.io/app/capture.html', page_referrer: 'https://reddit.com/', page_title: 'World Explorer — capture', site_section: 'capture' });
  assert.equal(analyticsPageContext({ href: 'https://worldexplorer3d.io/app/?lat=39&lon=-76&room=secret' }).page_location, 'https://worldexplorer3d.io/app/');
  assert.equal(analyticsPageContext({ href: 'https://worldexplorer3d.io/unknown/private@example.com' }, 'invalid').page_location, 'https://worldexplorer3d.io/');
});

test('canonical page sections preserve useful navigation without counting URL variants as different pages', () => {
  for (const [path, section] of [['/', 'home'], ['/about/', 'about'], ['/about.html', 'about'], ['/account/', 'account'], ['/account/admin.html?view=moderation', 'admin'], ['/legal/privacy.html', 'privacy'], ['/legal/terms/', 'terms']]) {
    assert.equal(analyticsPageContext({ href: 'https://worldexplorer3d.io' + path }).site_section, section);
  }
});

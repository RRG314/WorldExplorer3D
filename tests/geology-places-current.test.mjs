import test from 'node:test';
import assert from 'node:assert/strict';
import {geologyStartingPlaces, geologySiteDescriptor} from '../app/js/campaign/geology-places.js';
import {transitionGeologyCareer} from '../app/js/campaign/geology-career.js';

test('a new geology course offers the selected Earth place alongside its recommended starting point', () => {
  const context = {environment: 'earth', place: {lat: 52.0713, lon: -1.0168, name: 'Silverstone'}};
  const places = geologyStartingPlaces({context});
  assert.equal(places.length, 2);
  assert.equal(places[1].name, 'Silverstone');
  assert.equal(geologyStartingPlaces({context: {...context, environment: 'moon'}}).length, 1);
  assert.equal(geologyStartingPlaces({context: {...context, place: {lat: '52', lon: -1}}}).length, 1);
  assert.equal(geologyStartingPlaces({context: {environment: 'earth', place: places[0]}}).length, 1);
});

test('pause and resume retain the accepted world destination rather than relocating the course', () => {
  const destination = {lat: 39.3189, lon: -76.6363, name: 'Druid Hill Park'};
  const site = {
    ...geologySiteDescriptor(destination), truthType: 'virtual-training-site',
    location: {lat: 39.319, lon: -76.6363}, locationContext: destination,
    points: {a: {lat: 39.319, lon: -76.6364}, b: {lat: 39.319, lon: -76.6362}, bench: {lat: 39.3191, lon: -76.6363}}
  };
  const {state} = transitionGeologyCareer(null, {type: 'accept', revision: 0, runId: 'saved-place-study', variantId: 'campaign', site}, 1000);
  const places = geologyStartingPlaces({profile: {researchCareers: {geology: state}}, context: {environment: 'earth', place: {lat: 0, lon: 0}}});
  assert.equal(places.length, 1);
  assert.equal(places[0].lat, destination.lat);
  assert.equal(places[0].lon, destination.lon);
  assert.deepEqual(state.active.site.locationContext, destination);
  assert.deepEqual(state.active.site.points, site.points);
});

test('legacy course records retain their geographic site when no original destination was saved', () => {
  const location = {lat: 39.319, lon: -76.6363};
  const places = geologyStartingPlaces({profile: {researchCareers: {geology: {active: {phase: 'bench', site: {name: 'Saved field course', location}}}}}});
  assert.equal(places[0].lat, location.lat);
  assert.equal(places[0].name, 'Saved field course');
  assert.throws(() => geologySiteDescriptor({lat: Infinity, lon: 0}));
});

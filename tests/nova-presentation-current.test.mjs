import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {CAREER_EXPERIENCES} from '../app/js/experiences/catalog.js';
import {EXPERIENCE_GROUPS,experiencePresentation} from '../app/js/ui/experience-presentation.js';

test('every existing career has one reachable interest group without changing its identity',()=>{
  const groups=new Set(EXPERIENCE_GROUPS.map(item=>item.id));
  assert.equal(CAREER_EXPERIENCES.length,20);
  const seen=new Set();
  for(const entry of CAREER_EXPERIENCES){
    const view=experiencePresentation(entry);
    assert.ok(groups.has(view.group)&&view.group!=='all',entry.id);
    assert.ok(!seen.has(entry.id));seen.add(entry.id);
  }
  assert.equal(seen.size,20);
});

test('career images resolve to retained real references or actual gameplay assets with provenance',()=>{
  let references=0,captures=0;
  for(const entry of CAREER_EXPERIENCES){
    const image=experiencePresentation(entry).image;if(!image)continue;
    assert.ok(fs.statSync(fileURLToPath(image.src)).size>0,entry.id);
    assert.ok(image.alt&&image.caption);
    assert.doesNotMatch(image.src,/environment-atlas|generated_images|docs\/design/);
    if(image.sourceUrl){
      references++;assert.equal(new URL(image.sourceUrl).protocol,'https:');
      assert.match(image.caption,/Reference photo · .+ · (CC|Public domain)/);
    } else {captures++;assert.match(image.caption,/^Gameplay · /);}
  }
  assert.ok(references>=5&&captures>=5);
});

test('unknown or quick activities remain honest display fallbacks',()=>{
  const view=experiencePresentation({id:'game:unknown'});
  assert.equal(view.group,'all');assert.equal(view.image,null);
  assert.ok(view.symbol);assert.equal(Object.hasOwn(view,'enabled'),false);
  assert.equal(Object.hasOwn(view,'progress'),false);
});

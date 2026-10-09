import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

// README, landing and Pages all consume the same reviewed image inventory.
// The generated HTML is static: images still work with JavaScript disabled.
const check = process.argv.includes('--check');
const gallery = JSON.parse(await fs.readFile('config/public-gallery.json','utf8'));
const {version} = JSON.parse(await fs.readFile('package.json','utf8'));
if (gallery.version !== version) throw new Error(`Public gallery ${gallery.version} does not match package ${version}.`);
const items = new Map(gallery.images.map(image => [image.id,image]));
if (items.size !== gallery.images.length) throw new Error('Duplicate public gallery image IDs.');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for (const item of items.values()) {
  if (!/^assets\/gallery\/[0-9]+\.[0-9]+\/[a-z-]+\.webp$/.test(item.file)) throw new Error(`Unexpected image path: ${item.file}`);
  const bytes = await fs.readFile(item.file);
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error(`Unreviewed image change: ${item.id}`);
}
const get = id => {const item=items.get(id);if(!item)throw new Error(`Unknown gallery image ${id}`);return item;};
async function update(file, transform) {
  const before=await fs.readFile(file,'utf8'),after=transform(before);
  if (before===after) return;
  if (check) throw new Error(`${file} is not synchronized with the reviewed public gallery.`);
  await fs.writeFile(file,after);
}
for (const file of ['index.html','github-pages/index.html']) await update(file, source => {
  if (!source.includes('data-gallery="')) throw new Error(`${file} is missing its public gallery.`);
  return source.replace(/<img\b[^>]*data-gallery="([a-z-]+)"[^>]*>/g,(tag,id)=>{
  const item=get(id);
  return tag.replace(/\s(?:src|alt|width|height)="[^"]*"/g,'').replace(/>$/,` src="${escape(item.file)}" width="${item.width}" height="${item.height}" alt="${escape(item.alt)}">`);
});});
await update('github-pages/styles.css', source => source.replace(/url\("assets\/(?:showcase|gallery)\/[^\"]+"\)/, `url("${get('drone').file}")`));
await update('README.md', source => {
  const block = /<!-- public-gallery:start -->[\s\S]*?<!-- public-gallery:end -->/;
  if (!block.test(source)) throw new Error('README.md is missing its public gallery markers.');
  return source.replace(block,()=>{
  const markdown = id => {const item=get(id);return `![${item.alt}](${item.file})`;};
  const rows=[['walking','driving'],['flight','research-deck'],['diving','ship-interior'],['space','live-earth']];
  return `<!-- public-gallery:start -->\n${markdown('drone')}\n\n*Gameplay screenshots from the released ${gallery.version} build.*\n\n` + rows.map(([a,b])=>`| ${get(a).title} | ${get(b).title} |\n| :--: | :--: |\n| ${markdown(a)} | ${markdown(b)} |`).join('\n\n')+'\n<!-- public-gallery:end -->';
});});
await update(`RELEASE_NOTES_${version}.md`, source => {
  if (!source.includes('<!-- public-gallery:')) throw new Error('Release notes are missing their public gallery markers.');
  return source.replace(/(<!-- public-gallery:([a-z-]+) -->\s*)!\[[^\]]*\]\([^)]*\)/g, (_match, marker, id) => {
    const item = get(id);
    return `${marker}![${item.alt}](${item.file})`;
  });
});
console.log(`${check?'Checked':'Synchronized'} ${items.size} reviewed images across README, release notes, landing and GitHub Pages.`);

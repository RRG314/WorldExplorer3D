"""Build the bounded sky catalog from HYG v4.0 and Stellarium Western figures.
Inputs are downloaded public data, never viewer-extracted assets. Derived data
retains CC BY-SA attribution in app/assets/data/universe/observed-sky-sources.json.
"""
import csv, gzip, io, json, hashlib, sys
from pathlib import Path
root = Path(sys.argv[1])
hyg = root / 'hyg-v40.csv.gz'
western = root / 'western.json'
rows = list(csv.DictReader(io.StringIO(gzip.decompress(hyg.read_bytes()).decode())))
culture = json.loads(western.read_text())
by_hip = {int(r['hip']): r for r in rows if r['hip']}
figures = culture['constellations']
for figure in figures:
    figure['lines'] = [[hip for hip in line if isinstance(hip, int)] for line in figure['lines']]
names = {c['iau']: c['common_name'].get('native', c['iau']) for c in figures}
required = {hip for c in figures for line in c['lines'] for hip in line}
assert all(isinstance(hip, int) and hip in by_hip for hip in required)
selected = [r for r in rows if r['hip'] and (int(r['hip']) in required or float(r['mag']) <= 3.0)]
def record(r):
    distance = float(r['dist'])
    return dict(hip=int(r['hip']), name=r['proper'] or r['bf'].strip() or 'HIP '+r['hip'],
        proper=r['bf'].strip() or 'HIP '+r['hip'], ra=float(r['ra']), dec=float(r['dec']),
        dist=round(distance * 3.26156, 6) if 0 < distance < 100000 else None,
        mag=float(r['mag']), color=0xffffff, constellation=names.get(r['con'],r['con']))
stars = [record(r) for r in selected]
lines = {}; hip_lines = {}
for c in figures:
    name=names[c['iau']]; pairs=[pair for line in c['lines'] for pair in zip(line,line[1:])]
    lines[name]=[[[float(by_hip[h]['ra']),float(by_hip[h]['dec'])] for h in pair] for pair in pairs]
    hip_lines[name]=pairs
text='// Derived data: HYG v4.0 (David Nash) and Stellarium Western sky culture.\n// CC BY-SA 4.0; see assets/data/universe/observed-sky-sources.json.\n'
for key,value in [('BRIGHT_STARS',stars),('CONSTELLATION_LINES',lines),('CONSTELLATION_STAR_IDS',hip_lines)]:
    text+='export const '+key+' = '+json.dumps(value,separators=(',',':'))+';\n'
Path('app/js/sky/catalog.js').write_text(text)
metadata=dict(license='CC-BY-SA-4.0', licenseUrl='https://creativecommons.org/licenses/by-sa/4.0/',
    sources=[dict(author='David Nash / Astronexus',url='https://github.com/astronexus/HYG-Database',version='HYG v4.0',sha256=hashlib.sha256(hyg.read_bytes()).hexdigest()),
             dict(author='Stellarium contributors',url='https://github.com/Stellarium/stellarium-skycultures/tree/master/western',sha256=hashlib.sha256(western.read_bytes()).hexdigest())],
    modifications='Subset of bright and constellation member stars; parsecs converted to light years; HIP line graphs converted to coordinate pairs. No illustrations included.',
    epoch='J2000 catalog positions; proper motion not applied', starCount=len(stars),constellationCount=len(lines),
    limitations='Traditional Western line figures, not IAU boundaries. Unknown-distance stars cannot be reprojected for a distant observer.')
Path('app/assets/data/universe/observed-sky-sources.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps({'stars':len(stars),'constellations':len(lines),'bytes':len(text)}))

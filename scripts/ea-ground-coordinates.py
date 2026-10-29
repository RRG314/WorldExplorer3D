import json,math,pathlib,pyproj,struct,sys
from pyproj.transformer import TransformerGroup
from pyproj.aoi import AreaOfInterest
base=pathlib.Path(sys.argv[1])
pyproj.datadir.append_data_dir(str((base/'grids').resolve()))
plan=json.load(open(sys.argv[2])) if len(sys.argv)>2 else None
coverage=plan['coverage'] if plan else {'west':-.17,'south':51.48,'east':-.09,'north':51.54}
g=TransformerGroup('EPSG:9056+3855','EPSG:7405',always_xy=True,area_of_interest=AreaOfInterest(coverage['west'],coverage['south'],coverage['east'],coverage['north']),allow_ballpark=False)
assert pyproj.__version__ == '3.7.2' and pyproj.proj_version_str == '9.5.1', 'Pinned PROJ runtime required'
assert g.best_available and len(g.transformers)==1, 'Exact non-ballpark datum grids required'
tr=g.transformers[0]
metadata={'source':'EPSG:9056+3855','target':'EPSG:7405','definition':tr.definition,'description':tr.description,'accuracyMeters':tr.accuracy,'pyprojVersion':pyproj.__version__,'projVersion':pyproj.proj_version_str}
if plan:
 grid=plan['grid'];spacing=grid['spacingMeters'];radius=6378137
 count=(grid['maxColumn']-grid['minColumn']+1)*(grid['maxRow']-grid['minRow']+1)
 assert 0<count<=1500000, 'Bounded venue ground grid required'
 # Row-major triples avoid a JSON object for each fine-resolution point. The
 # resulting elevations still enter the existing accepted-ground compiler.
 with (base/(plan['id']+'.coordinates.f64')).open('wb') as output:
  longitudes=[math.degrees(column*spacing/radius) for column in range(grid['minColumn'],grid['maxColumn']+1)]
  for row in range(grid['minRow'],grid['maxRow']+1):
   latitude=math.degrees(2*math.atan(math.exp(row*spacing/radius))-math.pi/2)
   east,north,offset=tr.transform(longitudes,[latitude]*len(longitudes),[0]*len(longitudes),errcheck=True)
   for values in zip(east,north,offset):output.write(struct.pack('<ddd',*values))
 (base/(plan['id']+'.transform.json')).write_text(json.dumps(metadata,indent=2)+'\n')
 print(json.dumps({'id':plan['id'],'samples':count,'accuracyMeters':tr.accuracy}))
 sys.exit(0)
a=json.load(open('app/assets/ground/london/ground-artifact.json'));spacing=a['grid']['spacingMeters'];radius=6378137
rows=[]
def project(x,y):
 lon=math.degrees(x/radius);lat=math.degrees(2*math.atan(math.exp(y/radius))-math.pi/2)
 return tr.transform(lon,lat,0,errcheck=True)
for s in a['samples']:
 x=s['column']*spacing;y=s['row']*spacing;e,n,offset=project(x,y)
 corners=[project(x+dx*spacing/2,y+dy*spacing/2)[:2] for dx,dy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
 rows.append({'column':s['column'],'row':s['row'],'easting':e,'northing':n,'egmToOdnOffset':offset,'polygon':corners,'oldGround':s['groundElevationMeters']})
(base/'coordinates.json').write_text(json.dumps({'transform':metadata,'samples':rows},indent=2)+'\n')
print(len(rows),tr.accuracy)

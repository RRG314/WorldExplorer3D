import json,math,pathlib,pyproj,sys
from pyproj.transformer import TransformerGroup
from pyproj.aoi import AreaOfInterest
base=pathlib.Path(sys.argv[1])
pyproj.datadir.append_data_dir(str((base/'grids').resolve()))
g=TransformerGroup('EPSG:9056+3855','EPSG:7405',always_xy=True,area_of_interest=AreaOfInterest(-.17,51.48,-.09,51.54),allow_ballpark=False)
assert pyproj.__version__ == '3.7.2' and pyproj.proj_version_str == '9.5.1', 'Pinned PROJ runtime required'
assert g.best_available and len(g.transformers)==1, 'Exact non-ballpark datum grids required'
tr=g.transformers[0]
a=json.load(open('app/assets/ground/london/ground-artifact.json'));spacing=a['grid']['spacingMeters'];radius=6378137
rows=[]
def project(x,y):
 lon=math.degrees(x/radius);lat=math.degrees(2*math.atan(math.exp(y/radius))-math.pi/2)
 return tr.transform(lon,lat,0,errcheck=True)
for s in a['samples']:
 x=s['column']*spacing;y=s['row']*spacing;e,n,offset=project(x,y)
 corners=[project(x+dx*spacing/2,y+dy*spacing/2)[:2] for dx,dy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
 rows.append({'column':s['column'],'row':s['row'],'easting':e,'northing':n,'egmToOdnOffset':offset,'polygon':corners,'oldGround':s['groundElevationMeters']})
(base/'coordinates.json').write_text(json.dumps({'transform':{'source':'EPSG:9056+3855','target':'EPSG:7405','definition':tr.definition,'description':tr.description,'accuracyMeters':tr.accuracy,'pyprojVersion':pyproj.__version__,'projVersion':pyproj.proj_version_str},'samples':rows},indent=2)+'\n')
print(len(rows),tr.accuracy)

import sqlite3,json
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'assets/geography/runtime';out.mkdir(exist_ok=True);(out/'regions').mkdir(exist_ok=True)
r=sqlite3.connect(root/'assets/geography/regions.sqlite');r.row_factory=sqlite3.Row
nodes=[dict(x) for x in r.execute('SELECT n.*,r.bbox,r.label_lon longitude,r.label_lat latitude,r.geometry FROM navigation_nodes n JOIN regions r ON n.region_id=r.id')]
for n in nodes:
 n['bbox']=json.loads(n['bbox']);n['geometry']=json.loads(n['geometry'])
byid={n['id']:n for n in nodes}
china=byid['country:CHN']; components=[]
for key in ['country:CHN','country:HKG','country:MAC','country:TWN']:
 g=byid[key]['geometry'];components.extend([g['coordinates']] if g['type']=='Polygon' else g['coordinates'])
china['geometry']={'type':'MultiPolygon','coordinates':components}
def save(path,obj):path.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':')))
save(out/'catalog.json',[{k:v for k,v in n.items() if k!='geometry'} for n in nodes])
for parent in [None]+[n['id'] for n in nodes if n['kind']=='country']:
 subset=[n for n in nodes if n['parent_id']==parent];save(out/'regions'/('world.json' if parent is None else parent.replace(':','_')+'.json'),subset)
c=sqlite3.connect(root/'assets/geography/cities.sqlite');c.row_factory=sqlite3.Row
save(out/'cities.json',[{k:v for k,v in dict(x).items() if v is not None} for x in c.execute('SELECT id,name,name_ascii,aliases,latitude,longitude,navigation_country_id country_id,navigation_region_id region_id,population,admin_code,admin_type,coordinate_source,coordinate_precision,source_country,source_admin1_name,source_admin2,reference_name,admin_level FROM cities')])
print('runtime bytes',sum(p.stat().st_size for p in out.rglob('*.json')))

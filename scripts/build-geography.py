"""Build two offline SQLite databases and renderable, per-country GeoJSON packs.
Requires pyshp and shapely in the build environment only.
"""
import sys, json, sqlite3, zipfile, hashlib
from pathlib import Path
sys.path.insert(0,'/tmp/study-geography-libs')
import shapefile
from shapely.geometry import shape, mapping, Point
from shapely import STRtree, make_valid
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'work/geography-source'; OUT=ROOT/'assets/geography'; OUT.mkdir(exist_ok=True)
def records(name):
 z=zipfile.ZipFile(SRC/f'{name}.zip'); stem=next(n[:-4] for n in z.namelist() if n.endswith('.shp'))
 r=shapefile.Reader(shp=z.open(stem+'.shp'),shx=z.open(stem+'.shx'),dbf=z.open(stem+'.dbf'),encoding='utf-8')
 for sr in r.iterShapeRecords(): yield dict(sr.record.as_dict()),make_valid(shape(sr.shape.__geo_interface__))
def compact(o):return json.dumps(o,ensure_ascii=False,separators=(',',':'))
def db(name,schema):
 p=OUT/(name+'.sqlite'); tmp=OUT/(name+'.building.sqlite')
 if tmp.exists():tmp.unlink()
 c=sqlite3.connect(tmp);c.executescript(schema);return c,tmp,p
regions,tmp,rpath=db('regions','''CREATE TABLE regions(id TEXT PRIMARY KEY,parent_id TEXT,level INTEGER,name TEXT,name_en TEXT,iso2 TEXT,source_id TEXT,bbox TEXT,label_lon REAL,label_lat REAL,geometry TEXT); CREATE INDEX region_parent ON regions(parent_id); CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);''')
country={}; entries=[]; raw={}; warnings=[]; admin_codes={}
for props,g in records('countries'):
 code=props.get('ADM0_A3'); iso=props.get('ISO_A2_EH') or props.get('ISO_A2'); rid='country:'+code
 if not code or code=='-99':continue
 country[code]=rid; raw[rid]=g
 entries.append((rid,None,0,props.get('NAME_ZH') or props['NAME'],props.get('NAME_EN') or props['NAME'],iso,str(props.get('NE_ID')),g))
for props,g in records('regions'):
 parent=country.get(props.get('adm0_a3'))
 if not parent: warnings.append({'region':props.get('name'),'reason':'missing country'});continue
 rid='region:'+str(props['adm1_code']);raw[rid]=g
 if props.get('gn_a1_code'):admin_codes.setdefault(props['gn_a1_code'],[]).append((rid,parent))
 entries.append((rid,parent,1,props.get('name_zh') or props.get('name') or rid,props.get('name_en') or props.get('name') or rid,props.get('iso_a2'),props['adm1_code'],g))
packs={}; geometry_by_id={}
for rid,parent,level,name,en,iso,source,g in entries:
 simple=g.simplify(.025 if level==0 else .012,preserve_topology=True)
 geom=json.loads(compact(mapping(simple)),parse_float=lambda n:round(float(n),5));simple=shape(geom)
 if not simple.is_valid: geom=mapping(g.simplify(.008,preserve_topology=True));simple=shape(geom)
 label=g.representative_point();bbox=list(simple.bounds); geometry_by_id[rid]=geom
 regions.execute('INSERT INTO regions VALUES(?,?,?,?,?,?,?,?,?,?,?)',(rid,parent,level,name,en,iso,source,compact(bbox),label.x,label.y,compact(geom)))
 f={'type':'Feature','id':rid,'properties':{'id':rid,'parent_id':parent,'name':name,'name_en':en,'level':level},'geometry':geom}
 packs.setdefault('countries' if level==0 else parent.split(':')[1],[]).append(f)
regions.execute('INSERT INTO metadata VALUES(?,?)',('source','Natural Earth 5.1.1; public domain; source boundary perspective preserved; not a current legal boundary authority'))
regions.execute('CREATE TABLE navigation_nodes(id TEXT PRIMARY KEY,parent_id TEXT,region_id TEXT,name TEXT,kind TEXT)')
for rid,parent,level,name,en,iso,source,g in entries:
 if level==1 and (parent in ['country:HKG','country:MAC','country:TWN'] or source=='PFA+00?'):continue
 nav_parent=parent;kind='country' if level==0 else 'region'
 if rid in ['country:HKG','country:MAC','country:TWN']:
  nav_parent='country:CHN';kind='region';name={'country:HKG':'香港特别行政区','country:MAC':'澳门特别行政区','country:TWN':'台湾'}[rid]
 regions.execute('INSERT INTO navigation_nodes VALUES(?,?,?,?,?)',(rid,nav_parent,rid,name,kind))
regions.commit();regions.execute('VACUUM');regions.close();tmp.replace(rpath)
for key,features in packs.items():
 folder=OUT/'boundaries';folder.mkdir(exist_ok=True)
 (folder/(key+'.geojson')).write_text(compact({'type':'FeatureCollection','features':features}))
cities,tmp,cpath=db('cities','''CREATE TABLE cities(id TEXT PRIMARY KEY,name TEXT,name_ascii TEXT,aliases TEXT,country_id TEXT,region_id TEXT,source_country TEXT,source_admin1 TEXT,latitude REAL,longitude REAL,population INTEGER,match_method TEXT);CREATE INDEX city_parent ON cities(country_id,region_id);CREATE INDEX city_name ON cities(name);CREATE VIRTUAL TABLE city_search USING fts5(id UNINDEXED,names,tokenize='unicode61');CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);''')
byiso={e[5]:e[0] for e in sorted(entries,key=lambda e:e[7].area) if e[2]==0 and e[5] and e[5]!='-99'}
byiso.update({'BQ':'country:NLD','CC':'country:IOA','CX':'country:IOA','GF':'country:FRA','GP':'country:FRA','MQ':'country:FRA','RE':'country:FRA','SJ':'country:NOR','YT':'country:FRA'})
sub=[e for e in entries if e[2]==1];tree=STRtree([raw[e[0]] for e in sub]);unmatched=[];checks=[]
z=zipfile.ZipFile(SRC/'cities.zip'); name=next(n for n in z.namelist() if n.startswith('cities') and n.endswith('.txt'))
for line in z.read(name).decode().splitlines():
 f=line.split('\t');lat,lon=float(f[4]),float(f[5]);cid=byiso.get(f[8]);rid=None;method='country-only';point=Point(lon,lat)
 hits=tree.query(point,predicate='intersects');hits=[int(i) for i in hits if sub[int(i)][1]==cid]
 code_hits=[r for r,p in admin_codes.get(f[8]+'.'+f[10],[]) if p==cid]
 if len(code_hits)==1:rid=code_hits[0];method='geonames-admin-code'
 elif len(hits)==1:rid=sub[hits[0]][0];method='point-in-polygon'
 elif len(hits)>1:method='ambiguous';unmatched.append({'id':f[0],'name':f[1],'reason':method})
 else:unmatched.append({'id':f[0],'name':f[1],'reason':'no matching region polygon'})
 aliases=f[3].split(',');aliases=list(dict.fromkeys([a for a in aliases if any('\u4e00'<=ch<='\u9fff' for ch in a)]+[f[1],f[2]]))[:12];zh=next((a for a in aliases if a and all('\u4e00'<=ch<='\u9fff' for ch in a)),f[1])
 id='geonames:'+f[0]
 cities.execute('INSERT INTO cities VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(id,zh,f[2],compact(aliases),cid,rid,f[8],f[10],lat,lon,int(f[14]),method))
 cities.execute('INSERT INTO city_search VALUES(?,?)',(id,' '.join([zh,f[1],f[2],*aliases])))
 if f[1] in ['Hangzhou','Jiaxing']:checks.append({'id':id,'name':zh,'country_id':cid,'region_id':rid,'lat':lat,'lon':lon})
cities.execute('INSERT INTO metadata VALUES(?,?)',('source','GeoNames cities15000; CC BY 4.0; populated places over 15000 or capitals, not exhaustive administrative cities'))
cities.execute('ALTER TABLE cities ADD COLUMN navigation_country_id TEXT')
cities.execute('ALTER TABLE cities ADD COLUMN navigation_region_id TEXT')
cities.execute("UPDATE cities SET navigation_country_id=CASE WHEN country_id IN ('country:HKG','country:MAC','country:TWN') THEN 'country:CHN' ELSE country_id END,navigation_region_id=CASE WHEN country_id IN ('country:HKG','country:MAC','country:TWN') THEN country_id ELSE region_id END")
cities.commit();count=cities.execute('SELECT count(*) FROM cities').fetchone()[0];cities.execute('VACUUM');methods=dict(cities.execute('SELECT match_method,count(*) FROM cities GROUP BY match_method'));missing_country=cities.execute('SELECT count(*) FROM cities WHERE country_id IS NULL').fetchone()[0];cities.close();tmp.replace(cpath)
assert len(checks)==2 and all(c['country_id']=='country:CHN' and c['region_id'] for c in checks),checks
report={'matching_methods':methods,'cities_missing_country':missing_country,'china_navigation_count':34,'countries':len(country),'regions':len(sub),'cities':count,'china_regions':[{'id':e[0],'name':e[3]} for e in sub if e[1]=='country:CHN'],'checks':checks,'unmatched_city_count':len(unmatched),'boundary_warnings':warnings,'files':{str(p.relative_to(OUT)):p.stat().st_size for p in OUT.rglob('*') if p.is_file()},'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in SRC.glob('*.zip')}}
(OUT/'coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));(SRC/'unmatched-cities.json').write_text(json.dumps(unmatched,ensure_ascii=False,indent=2))
print(compact({k:v for k,v in report.items() if k not in ['files','source_sha256','china_regions']}))

# Reapply the pinned mainland administrative index on every full rebuild.
import subprocess
subprocess.run([sys.executable,str(ROOT/"scripts/normalize-china-cities.py")],check=True)

subprocess.run([sys.executable,str(ROOT/"scripts/normalize-world-regions.py")],check=True)

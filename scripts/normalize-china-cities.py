"""Replace mainland populated-place search with a versioned administrative index.
Offline/idempotent. Source snapshots and coordinate audit are retained for review.
"""
import json, sqlite3, zipfile, math, hashlib, shutil
from pathlib import Path
from collections import Counter
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'assets/geography'
SRC = OUT/'sources/china'
def compact(value): return json.dumps(value, ensure_ascii=False, separators=(',', ':'))
def gcj_to_wgs(lon, lat):
    # Approximate inverse; source coordinates are location hints, not surveyed points.
    def forward(lng, latitude):
        x, y = lng-105, latitude-35
        dlat = -100+2*x+3*y+.2*y*y+.1*x*y+.2*math.sqrt(abs(x))
        dlat += (20*math.sin(6*x*math.pi)+20*math.sin(2*x*math.pi))*2/3
        dlat += (20*math.sin(y*math.pi)+40*math.sin(y/3*math.pi))*2/3
        dlat += (160*math.sin(y/12*math.pi)+320*math.sin(y*math.pi/30))*2/3
        dlon = 300+x+2*y+.1*x*x+.1*x*y+.1*math.sqrt(abs(x))
        dlon += (20*math.sin(6*x*math.pi)+20*math.sin(2*x*math.pi))*2/3
        dlon += (20*math.sin(x*math.pi)+40*math.sin(x/3*math.pi))*2/3
        dlon += (150*math.sin(x/12*math.pi)+300*math.sin(x/30*math.pi))*2/3
        rad = latitude*math.pi/180; magic = 1-.00669342162296594323*math.sin(rad)**2
        dlat = dlat*180/((6378245*(1-.00669342162296594323))/(magic*math.sqrt(magic))*math.pi)
        dlon = dlon*180/(6378245/math.sqrt(magic)*math.cos(rad)*math.pi)
        return lng+dlon, latitude+dlat
    lng, latitude = lon, lat
    for _ in range(6):
        a,b=forward(lng,latitude);lng-=a-lon;latitude-=b-lat
    return round(lng,6),round(latitude,6)
def distance(lon,lat,center):
    return math.hypot((lon-center[0])*math.cos(math.radians(center[1])),lat-center[1])*111

def main():
    names = dict(line.split() for line in (SRC/'areacodes-2025.txt').read_text().splitlines() if line.strip())
    prefectures = {c:n for c,n in names.items() if c.endswith('00') and not c.endswith('0000')}
    crosscheck = {r['code']+'00':r['name'] for r in json.loads((SRC/'modood-cities.json').read_text())}
    differences = [(c,n,crosscheck.get(c)) for c,n in prefectures.items() if crosscheck.get(c)!=n]
    assert not differences, differences
    assert len(prefectures)==333
    assert sum(n.endswith('市') for n in prefectures.values())==293
    # Administrative list, not a hierarchy based on coordinate containment.
    maps=sqlite3.connect(OUT/'regions.sqlite')
    regions=dict((name,id) for id,name in maps.execute("SELECT id,name FROM navigation_nodes WHERE parent_id='country:CHN'"))
    centers={r['code']:r for r in json.loads((SRC/'datav-centers.json').read_text())}
    z=zipfile.ZipFile(ROOT/'work/geography-source/cities.zip')
    raw=[line.split('\t') for line in z.read('cities15000.txt').decode().splitlines()]
    cn=[f for f in raw if f[8]=='CN']
    municipalities={c:names[c] for c in ['110000','120000','310000','500000']}
    units={**prefectures,**municipalities}
    rows=[];audit=[];crosswalk=[]
    for code,name in sorted(units.items()):
        province=code[:2]+'0000';rid=regions[names[province]]
        kind=('municipality' if code in municipalities else 'prefecture_city' if name.endswith('市') else 'autonomous_prefecture' if name.endswith('自治州') else 'league' if name.endswith('盟') else 'prefecture')
        wanted={name,name.removesuffix('市')}
        candidates=[f for f in cn if wanted & set([f[1],f[2],*f[3].split(',')])]
        center=centers.get(code,{}).get('center')
        if center: candidates.sort(key=lambda f:distance(float(f[5]),float(f[4]),center))
        else: candidates.sort(key=lambda f:-int(f[14]))
        matched=candidates[0] if candidates else None
        if matched and center:
            assert distance(float(matched[5]),float(matched[4]),center)<30,(code,name,'coordinate mismatch')
        if matched:
            lat,lon=float(matched[4]),float(matched[5]);ascii_name=matched[2]
            source='GeoNames:'+matched[0];precision='city_reference_point';population=int(matched[14])
            # Do not import arbitrary settlement aliases into the administrative name index.
            aliases=[name,name.removesuffix('市'),matched[1],ascii_name]
            crosswalk.append({'legacy_id':'geonames:'+matched[0],'city_id':'cn-admin:'+code})
        else:
            assert center,(code,name,'missing coordinates')
            lon,lat=gcj_to_wgs(*center);ascii_name='';population=0
            source='DataV:'+code;precision='approximate_admin_reference_point';aliases=[name]
        aliases=list(dict.fromkeys(aliases))
        row={'id':'cn-admin:'+code,'name':name,'name_ascii':ascii_name,'aliases':compact(aliases),'country_id':'country:CHN','region_id':rid,'source_country':'CN','source_admin1':province,'latitude':lat,'longitude':lon,'population':population,'match_method':'administrative-code-2025','navigation_country_id':'country:CHN','navigation_region_id':rid,'admin_code':code,'admin_type':kind,'coordinate_source':source,'coordinate_precision':precision}
        rows.append(row)
        audit.append({'code':code,'name':name,'province':names[province],'type':kind,'coordinate_source':source,'coordinate_precision':precision,'longitude':lon,'latitude':lat,'datav_distance_km':round(distance(lon,lat,center),2) if center else None})
    assert len({r['id'] for r in rows})==337
    target=OUT/'cities.sqlite';temp=OUT/'cities.normalizing.sqlite'
    if temp.exists():temp.unlink()
    original=sqlite3.connect(target);db=sqlite3.connect(temp);original.backup(db);original.close()
    try:
        # Keep old data and IDs intact for audit, without returning them in default searches.
        db.execute("CREATE TABLE IF NOT EXISTS legacy_china_places AS SELECT * FROM cities WHERE source_country='CN'")
        old_count=db.execute('SELECT count(*) FROM legacy_china_places').fetchone()[0]
        columns={r[1] for r in db.execute('PRAGMA table_info(cities)')}
        for col in ['admin_code','admin_type','coordinate_source','coordinate_precision']:
            if col not in columns:db.execute(f'ALTER TABLE cities ADD COLUMN {col} TEXT')
        db.execute("DELETE FROM city_search WHERE id IN (SELECT id FROM cities WHERE source_country='CN')")
        db.execute("DELETE FROM cities WHERE source_country='CN'")
        db.execute('CREATE TABLE IF NOT EXISTS china_city_id_crosswalk(legacy_id TEXT PRIMARY KEY,city_id TEXT NOT NULL)')
        db.execute('DELETE FROM china_city_id_crosswalk')
        for item in crosswalk:db.execute('INSERT INTO china_city_id_crosswalk VALUES(:legacy_id,:city_id)',item)
        cols=','.join(rows[0]);values=','.join(':'+k for k in rows[0])
        db.executemany(f'INSERT INTO cities({cols}) VALUES({values})',rows)
        db.executemany('INSERT INTO city_search VALUES(?,?)',[(r['id'],' '.join(json.loads(r['aliases']))) for r in rows])
        db.execute('CREATE UNIQUE INDEX IF NOT EXISTS china_admin_code ON cities(admin_code) WHERE admin_code IS NOT NULL')
        db.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)',('china_administrative_index','2025-12-31; areacodes + modood crosscheck; 293 prefecture cities, 30 autonomous prefectures, 7 prefectures, 3 leagues, 4 municipalities. HK/MO/TW not normalized by this mainland index.'))
        db.commit();assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
        db.execute('VACUUM');db.close();temp.replace(target)
    except Exception:
        db.close();temp.unlink(missing_ok=True);raise
    report={'as_of':'2025-12-31','scope':'mainland China; HK/MO/TW retained from previous dataset, not certified by this audit','previous_mainland_places':old_count,'administrative_places':len(rows),'types':dict(Counter(r['admin_type'] for r in rows)),'code_name_mismatches':differences,'coordinate_sources':dict(Counter(r['coordinate_source'].split(':')[0] for r in rows)),'zhejiang':[r['name'] for r in rows if r['admin_code'].startswith('33')],'units':audit,'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in SRC.iterdir() if p.is_file()}}
    (OUT/'china-city-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    coverage_path=OUT/'coverage.json'
    coverage=json.loads(coverage_path.read_text())
    current=sqlite3.connect(target)
    coverage['cities']=current.execute('SELECT count(*) FROM cities').fetchone()[0]
    coverage['matching_methods']=dict(current.execute('SELECT match_method,count(*) FROM cities GROUP BY match_method'))
    coverage['china_administrative_audit']='china-city-audit.json'
    coverage['china_administrative_places']=len(rows)
    current.close()
    coverage_path.write_text(json.dumps(coverage,ensure_ascii=False,indent=2))
    print(compact({k:v for k,v in report.items() if k not in ['units','source_sha256']}))
if __name__=='__main__':main()

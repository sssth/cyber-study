"""Normalize non-China search records to GeoNames ADM2 units, not settlements.
Names/levels/parents come from administrative directories; points only locate units.
No population threshold is used to define administrative status. Offline/idempotent.
"""
import json, sqlite3, zipfile, hashlib, sys, re, unicodedata
from pathlib import Path
from collections import Counter, defaultdict
sys.path.insert(0, '/tmp/study-geography-libs')
import shapefile
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'assets/geography';SRC=OUT/'sources/world'
EXCLUDED={'CN','HK','MO','TW'}
def compact(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def directory(name):
    rows=[line.split('\t') for line in (SRC/name).read_text().splitlines()]
    assert all(len(r)==4 for r in rows), 'Truncated directory'
    assert len({r[0] for r in rows})==len(rows), 'Duplicate administrative code'
    return {r[0]:r for r in rows}
def comparable_name(value):
    value=''.join(c for c in unicodedata.normalize('NFKD',value).lower() if not unicodedata.combining(c))
    words=re.findall(r'[a-z0-9]+',value)
    ignored={'county','city','district','municipality','municipal','shi','shih','borough','region','of','the'}
    return ' '.join(w for w in words if w not in ignored)
def main():
    a1=directory('admin1CodesASCII.txt');a2=directory('admin2Codes.txt')
    assert len(a1)>3000 and len(a2)>40000
    z=zipfile.ZipFile(ROOT/'work/geography-source/cities.zip')
    raw={f[0]:f for f in (line.split('\t') for line in z.read('cities15000.txt').decode().splitlines())}
    reg=sqlite3.connect(OUT/'regions.sqlite');reg.row_factory=sqlite3.Row
    region_by_id={r['id']:dict(r) for r in reg.execute('SELECT * FROM regions')}
    z=zipfile.ZipFile(ROOT/'work/geography-source/regions.zip');dbf=next(n for n in z.namelist() if n.endswith('.dbf'))
    bridges=defaultdict(set)
    for record in shapefile.Reader(dbf=z.open(dbf),encoding='utf-8').iterRecords():
        r=record.as_dict();rid='region:'+r['adm1_code']
        if r.get('gn_a1_code') and rid in region_by_id:bridges[r['gn_a1_code']].add(rid)
    target=OUT/'cities.sqlite';temp=OUT/'cities.world-normalizing.sqlite';temp.unlink(missing_ok=True)
    origin=sqlite3.connect(target);db=sqlite3.connect(temp);origin.backup(db);origin.close();db.row_factory=sqlite3.Row
    try:
        db.execute("CREATE TABLE IF NOT EXISTS legacy_world_places AS SELECT * FROM cities WHERE source_country NOT IN ('CN','HK','MO','TW')")
        old=[dict(r) for r in db.execute('SELECT * FROM legacy_world_places')]
        grouped=defaultdict(list);rejected=[];baseline=defaultdict(Counter)
        # An inhabited point can supply a reference coordinate, never the unit's identity.
        allowed={'PPL','PPLA','PPLA2','PPLA3','PPLA4','PPLA5','PPLC'}
        for row in old:
            f=raw.get(row['id'].removeprefix('geonames:'))
            if not f:raise ValueError('Missing original record: '+row['id'])
            baseline[f[8]][f[7]]+=1
            code='.'.join([f[8],f[10],f[11]]);parent='.'.join([f[8],f[10]])
            reason=None
            if f[7] not in allowed:reason='not_a_current_reference_settlement'
            elif parent not in a1:reason='unknown_admin1_code'
            elif code not in a2:reason='unknown_admin2_code'
            elif not row['country_id']:reason='missing_globe_country'
            if reason:rejected.append({'id':row['id'],'source_country':f[8],'feature_code':f[7],'reason':reason});continue
            grouped[code].append((row,f))
        columns={r['name'] for r in db.execute('PRAGMA table_info(cities)')}
        for col in ['source_admin2','source_admin1_name','source_feature_code','reference_name','reference_geonames_id','admin_level']:
            if col not in columns:db.execute(f'ALTER TABLE cities ADD COLUMN {col} '+('INTEGER' if col=='admin_level' else 'TEXT'))
        db.execute('DROP TABLE IF EXISTS world_admin2_registry')
        db.execute('CREATE TABLE world_admin2_registry(code TEXT PRIMARY KEY,name TEXT,name_ascii TEXT,geonames_id TEXT,country_code TEXT,parent_code TEXT,parent_name TEXT,has_reference INTEGER NOT NULL)')
        registry=[]
        for code,r in a2.items():
            country=code.split('.')[0];parent=code.rsplit('.',1)[0]
            if country in EXCLUDED:continue
            registry.append((code,r[1],r[2],r[3],country,parent,a1[parent][1] if parent in a1 else None,int(code in grouped)))
        db.executemany('INSERT INTO world_admin2_registry VALUES(?,?,?,?,?,?,?,?)',registry)
        db.execute('DROP TABLE IF EXISTS world_reference_crosswalk')
        db.execute('CREATE TABLE world_reference_crosswalk(legacy_id TEXT PRIMARY KEY,unit_id TEXT NOT NULL,relationship TEXT NOT NULL)')
        results=[];counts=Counter();country_reports=[]
        priorities={'PPLA2':0,'PPLC':1,'PPLA':2,'PPL':3,'PPLA3':4,'PPLA4':5,'PPLA5':6}
        for code,candidates in sorted(grouped.items()):
            canonical=comparable_name(a2[code][2])
            candidates.sort(key=lambda pair:(0 if canonical and comparable_name(pair[1][2])==canonical else 1,priorities[pair[1][7]],-int(pair[1][14]),int(pair[1][0])))
            row,f=candidates[0];parent=code.rsplit('.',1)[0];official=a2[code];rid=None
            possible=bridges.get(parent,set())
            # Never substitute point-in-polygon for a mismatched administrative tier.
            if len(possible)==1:
                candidate=next(iter(possible))
                if region_by_id[candidate]['parent_id']==row['country_id']:rid=candidate
            counts['direct_admin1_bridge' if rid else 'country_navigation_with_source_parent']+=1
            aliases=list(dict.fromkeys([official[1],official[2],row['name'],f[1],f[2],*json.loads(row['aliases'])]))
            unit={'id':'gn-admin2:'+code,'name':official[1],'name_ascii':official[2],'aliases':compact(aliases),'country_id':row['country_id'],'region_id':rid,'source_country':f[8],'source_admin1':f[10],'source_admin2':f[11],'source_admin1_name':a1[parent][1],'latitude':float(f[4]),'longitude':float(f[5]),'population':0,'match_method':'geonames-administrative-directory','navigation_country_id':row['navigation_country_id'],'navigation_region_id':rid,'admin_code':code,'admin_type':'admin2','admin_level':2,'coordinate_source':'GeoNames:'+f[0],'coordinate_precision':'administrative_seat' if f[7]=='PPLA2' else 'inhabited_reference_point','source_feature_code':f[7],'reference_name':row['name'],'reference_geonames_id':f[0]}
            results.append(unit)
            db.executemany('INSERT INTO world_reference_crosswalk VALUES(?,?,?)',[(r['id'],unit['id'],'located_in_not_equivalent') for r,_ in candidates])
        db.execute("DELETE FROM city_search WHERE id IN (SELECT id FROM cities WHERE source_country NOT IN ('CN','HK','MO','TW'))")
        db.execute("DELETE FROM cities WHERE source_country NOT IN ('CN','HK','MO','TW')")
        for row in results:
            cols=','.join(row);vals=','.join(':'+c for c in row)
            db.execute(f'INSERT INTO cities({cols}) VALUES({vals})',row)
            db.execute('INSERT INTO city_search VALUES(?,?)',(row['id'],' '.join(json.loads(row['aliases']))))
        db.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)',('world_administrative_index','GeoNames ADM2 directory snapshot; not legal-city certification; canonical units with source parent codes; representative point may be a settlement, never an administrative identity; CN/HK/MO/TW unchanged'))
        for country in sorted(set(baseline)|{r[4] for r in registry}):
            total=sum(r[4]==country for r in registry);supported=sum(r['source_country']==country for r in results)
            country_reports.append({'country_code':country,'old_records':sum(baseline[country].values()),'old_features':dict(baseline[country]),'admin2_directory_units':total,'searchable_admin2_units':supported,'without_reference':total-supported,'policy':'ADM2 only; otherwise country / existing region navigation','status':'partial' if supported and supported<total else 'directory-covered' if supported else 'country-region-only'})
        db.commit();assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
        final_count=db.execute('SELECT count(*) FROM cities').fetchone()[0]
        db.execute('VACUUM');db.close();temp.replace(target)
    except Exception:
        db.close();temp.unlink(missing_ok=True);raise
    report={'source_date':'2026-11-15','scope_excluded':sorted(EXCLUDED),'old_records':len(old),'old_feature_counts':dict(sum(baseline.values(),Counter())),'directory_units':len(registry),'searchable_units':len(results),'countries_with_searchable_units':len({r['source_country'] for r in results}),'rejected_reference_records':len(rejected),'rejection_reasons':dict(Counter(r['reason'] for r in rejected)),'navigation_mapping':dict(counts),'countries':country_reports,'rejected_references':rejected,'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in SRC.iterdir() if p.is_file()},'limits':['Administrative classification consistency, not a country-by-country government register certification.','ADM2 local meaning differs by country; names are from source, not guessed translations.','Directory units without a usable reference coordinate remain in registry, not displayed as invented points.','Reference point is not necessarily centroid, capital or a legal city.','Existing country/ADM1 boundary layers are not replaced.']}
    (OUT/'world-administrative-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    coverage_path=OUT/'coverage.json';coverage=json.loads(coverage_path.read_text());coverage['cities']=final_count;coverage['world_administrative_audit']='world-administrative-audit.json';coverage['world_admin2_searchable']=len(results)
    con=sqlite3.connect(target);coverage['matching_methods']=dict(con.execute('SELECT match_method,count(*) FROM cities GROUP BY match_method'));con.close()
    coverage_path.write_text(json.dumps(coverage,ensure_ascii=False,indent=2))
    print(compact({k:v for k,v in report.items() if k not in ['countries','rejected_references','source_sha256','limits']}))
if __name__=='__main__':main()

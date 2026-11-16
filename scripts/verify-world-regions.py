"""Check every world search record against source administrative directories."""
import sqlite3,json,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'assets/geography';excluded={'CN','HK','MO','TW'}
a1={r[0]:r for r in (line.split('\t') for line in (out/'sources/world/admin1CodesASCII.txt').read_text().splitlines())}
a2={r[0]:r for r in (line.split('\t') for line in (out/'sources/world/admin2Codes.txt').read_text().splitlines())}
z=zipfile.ZipFile(root/'work/geography-source/cities.zip');raw={r[0]:r for r in (line.split('\t') for line in z.read('cities15000.txt').decode().splitlines())}
c=sqlite3.connect(out/'cities.sqlite');c.row_factory=sqlite3.Row;c.execute('ATTACH DATABASE ? AS map',(str(out/'regions.sqlite'),))
rows=[dict(r) for r in c.execute("SELECT * FROM cities WHERE source_country NOT IN ('CN','HK','MO','TW')")]
assert len(rows)>10000
for r in rows:
    code=r['admin_code'];parent=code.rsplit('.',1)[0];f=raw[r['reference_geonames_id']]
    assert r['admin_type']=='admin2' and r['admin_level']==2
    assert r['id']=='gn-admin2:'+code and r['name']==a2[code][1]
    assert parent in a1 and r['source_admin1_name']==a1[parent][1]
    assert code=='.'.join([f[8],f[10],f[11]])
    assert f[7] not in {'PPLX','PPLH','PPLQ','PPLW','PPLL','PPLS','STLMT'}
    assert r['longitude']==float(f[5]) and r['latitude']==float(f[4])
    if r['region_id']:
        region=c.execute('SELECT parent_id FROM map.regions WHERE id=?',(r['region_id'],)).fetchone()
        assert region and region['parent_id']==r['country_id']
    assert r['navigation_region_id']==r['region_id']
assert len({r['admin_code'] for r in rows})==len(rows)
assert {r['admin_code'] for r in rows}=={r[0] for r in c.execute('SELECT code FROM world_admin2_registry WHERE has_reference=1')}
assert not c.execute('SELECT id FROM city_search EXCEPT SELECT id FROM cities').fetchall()
assert not c.execute('SELECT id FROM cities EXCEPT SELECT id FROM city_search').fetchall()
runtime=json.loads((out/'runtime/cities.json').read_text());assert {r['id']:r['name'] for r in runtime if r['id'].startswith('gn-admin2:')}=={r['id']:r['name'] for r in rows}
byid={r['admin_code']:r for r in rows}
assert byid['FR.11.75']['name']=='Paris'
assert byid['GB.ENG.GLA']['name']=='Greater London' and byid['GB.ENG.GLA']['region_id'] is None
assert byid['JP.22.1857906']['reference_geonames_id']=='1857910', 'Kyoto must not use neighboring Muko as reference'
assert byid['US.NY.061']['name']=='New York County'
assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
print(f'PASS: {len(rows)} canonical ADM2 units; every code/name/parent/reference matches sources; no settlement identities or FTS orphans; UK fallback and Kyoto regression; runtime synchronized')

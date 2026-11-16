"""Independent inventory/hierarchy/search regression checks for the pinned index."""
import json,sqlite3,re
from pathlib import Path
from collections import Counter
root=Path(__file__).resolve().parents[1]/'assets/geography'
c=sqlite3.connect(root/'cities.sqlite');c.row_factory=sqlite3.Row
c.execute('ATTACH DATABASE ? AS map',(str(root/'regions.sqlite'),))
rows=[dict(r) for r in c.execute("SELECT * FROM cities WHERE source_country='CN'")]
names=dict(line.split() for line in (root/'sources/china/areacodes-2025.txt').read_text().splitlines())
expected={code:name for code,name in names.items() if code.endswith('00') and not code.endswith('0000')}
actual={r['admin_code']:r['name'] for r in rows if r['admin_type']!='municipality'}
assert actual==expected
assert Counter(r['admin_type'] for r in rows)=={'prefecture_city':293,'autonomous_prefecture':30,'prefecture':7,'league':3,'municipality':4}
assert len(rows)==len({r['id'] for r in rows})==337
assert all(not re.search('[a-zA-Z]',r['name']) for r in rows)
for r in rows:
    province=c.execute('SELECT name,parent_id FROM map.navigation_nodes WHERE id=?',(r['region_id'],)).fetchone()
    assert province['name']==names[r['admin_code'][:2]+'0000'] and province['parent_id']=='country:CHN',r
    assert r['navigation_region_id']==r['region_id'] and r['navigation_country_id']=='country:CHN'
    assert -90<=r['latitude']<=90 and -180<=r['longitude']<=180 and r['coordinate_source']
assert {r['name'] for r in rows if r['admin_code'].startswith('33')}==set('杭州市 宁波市 温州市 嘉兴市 湖州市 绍兴市 金华市 衢州市 舟山市 台州市 丽水市'.split())
assert not any(r['name'] in ['义乌市','余姚市','上虞','仙桃市','济源市','市辖区'] for r in rows)
assert c.execute("SELECT count(*) FROM cities WHERE source_country='CN' AND admin_type IS NULL").fetchone()[0]==0
assert c.execute("SELECT count(*) FROM city_search WHERE id LIKE 'cn-admin:%'").fetchone()[0]==337
assert not c.execute('SELECT id FROM city_search EXCEPT SELECT id FROM cities').fetchall()
assert c.execute("SELECT count(*) FROM city_search WHERE city_search MATCH 'Hangzhou'").fetchone()[0]>=1
runtime=json.loads((root/'runtime/cities.json').read_text())
assert {r['id']:r['name'] for r in runtime if r['id'].startswith('cn-admin:')}=={r['id']:r['name'] for r in rows}
print('PASS: 333 prefectural units + 4 municipalities; exact names/codes/provinces; Zhejiang 11; no county/capital placeholders; FTS and runtime in sync')

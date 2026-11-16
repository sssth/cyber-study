import sqlite3,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'assets/geography'
c=sqlite3.connect(root/'cities.sqlite');c.execute('ATTACH DATABASE ? AS map',(str(root/'regions.sqlite'),))
assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert c.execute('PRAGMA map.integrity_check').fetchone()[0]=='ok'
assert c.execute('SELECT count(*) FROM cities WHERE latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180').fetchone()[0]==0
assert c.execute('SELECT count(*) FROM cities c LEFT JOIN map.regions r ON c.region_id=r.id WHERE c.region_id IS NOT NULL AND (r.id IS NULL OR r.parent_id!=c.country_id)').fetchone()[0]==0
for name in ['杭州','嘉兴']:
 rows=c.execute('SELECT c.name,r.name,c.country_id FROM cities c JOIN map.regions r ON r.id=c.region_id WHERE c.name LIKE ? OR c.aliases LIKE ?',('%'+name+'%','%'+name+'%')).fetchall()
 assert any(row[2]=='country:CHN' and ('浙江' in row[1] or 'Zhejiang' in row[1]) for row in rows),(name,rows)
 print(name,rows)
print('PASS: database integrity, coordinate ranges, hierarchy references, Hangzhou/Jiaxing Zhejiang linkage')

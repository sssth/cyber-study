"""Offline lookup: python3 scripts/query-geography.py 杭州"""
import sqlite3,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'assets/geography'
c=sqlite3.connect(root/'cities.sqlite');c.row_factory=sqlite3.Row
c.execute('ATTACH DATABASE ? AS map',(str(root/'regions.sqlite'),))
q=sys.argv[1] if len(sys.argv)>1 else '杭州'
rows=c.execute('''SELECT c.id,c.name,c.latitude,c.longitude,c.match_method,c.country_id,c.region_id,a.name country,r.name region FROM cities c LEFT JOIN map.regions a ON a.id=c.country_id LEFT JOIN map.regions r ON r.id=c.region_id WHERE c.name LIKE ? OR c.name_ascii LIKE ? OR c.aliases LIKE ? ORDER BY c.population DESC LIMIT 20''',tuple(['%'+q+'%']*3)).fetchall()
print(json.dumps([dict(r) for r in rows],ensure_ascii=False,indent=2))

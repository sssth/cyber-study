export function polygons(g) { return g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : (g.geometries || []).flatMap(polygons); }
export function contains(geometry, lon, lat) {
  const inside = ring => { let result = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [x,y]=ring[i], [a,b]=ring[j]; if ((y>lat)!==(b>lat) && lon < (a-x)*(lat-y)/(b-y)+x) result=!result; } return result; };
  return polygons(geometry).some(rings => inside(rings[0]) && !rings.slice(1).some(inside));
}
export function regionView(node) {
  const [west,south,east,north]=node.bbox;
  const broad=east-west>170;
  const latitude=broad?node.latitude:(south+north)/2,longitude=broad?node.longitude:(west+east)/2;
  const angle=Math.min(1.1,Math.max(north-south,(east-west)*Math.cos(latitude*Math.PI/180))*Math.PI/360*1.3);
  return {latitude,longitude,distance:Math.max(1.045,Math.min(3.6,Math.cos(angle)+Math.sin(angle)/Math.tan(43*Math.PI/360)))};
}

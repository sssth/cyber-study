import { useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { BufferGeometry, Float32BufferAttribute, Object3D, Vector3 } from 'three';
import { useThree } from '@react-three/fiber';
import { globePosition } from './geo.js';
import { polygons } from './geography.js';
import { atlasPalette } from './palette.js';
export function RegionLines({ features, color = atlasPalette.border, opacity = .32 }) {
  const geometry = useMemo(()=>{
    const positions=[];
    for(const f of features) for(const polygon of polygons(f.geometry)) for(const ring of polygon) for(let i=1;i<ring.length;i++) {
      const a=ring[i-1],b=ring[i];let dx=b[0]-a[0];if(dx>180)dx-=360;if(dx< -180)dx+=360;
      const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(b[1]-a[1]))/.5));
      for(let j=0;j<steps;j++) {for(const t of [j/steps,(j+1)/steps])positions.push(...globePosition(a[1]+(b[1]-a[1])*t,a[0]+dx*t,1.001));}
    }
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));return g;
  },[features]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <lineSegments geometry={geometry} raycast={()=>null}><lineBasicMaterial color={color} transparent opacity={opacity} /></lineSegments>;
}
export function CityPoints({ cities, selected, onSelect }) {
  const ref=useRef();const {camera,invalidate}=useThree();
  useLayoutEffect(()=>{const o=new Object3D();cities.forEach((city,i)=>{o.position.fromArray(globePosition(city.latitude,city.longitude,1.002));o.scale.setScalar(city.id===selected?.id? .0012:.0005);o.updateMatrix();ref.current.setMatrixAt(i,o.matrix)});if(ref.current){ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere()}invalidate();},[cities,selected,invalidate]);
  return <instancedMesh key={cities.length} ref={ref} args={[null,null,cities.length]} frustumCulled={false} onClick={e=>{e.stopPropagation();const c=cities[e.instanceId];if(c&&new Vector3(...globePosition(c.latitude,c.longitude)).dot(camera.position)>1.002)onSelect(c,e)}}><sphereGeometry args={[1,8,6]}/><meshBasicMaterial color="#77d9ff" toneMapped={false}/></instancedMesh>;
}

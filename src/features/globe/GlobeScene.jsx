import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { CanvasTexture, Color, Object3D, Quaternion, SRGBColorSpace, Vector3, Spherical } from 'three';
import { globePosition } from './geo.js';
import { atlasPalette as colors } from './palette.js';
import { RegionLines, CityPoints } from './RegionLines.jsx';
import { detailTexture, applyDetail } from './detailTexture.js';
import { contains } from './geography.js';
import landRings from './land.json';

function atlasTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colors.ocean; ctx.fillRect(0, 0, 2048, 1024);
  ctx.strokeStyle = colors.grid; ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 30) { const x = (lon + 180) / 360 * 2048; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke(); }
  for (let lat = -60; lat <= 60; lat += 30) { const y = (90 - lat) / 180 * 1024; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke(); }
  ctx.fillStyle = colors.land; ctx.strokeStyle = colors.coast; ctx.lineWidth = .65;
  for (const polygon of landRings) {
    ctx.beginPath();
    for (const ring of polygon) { ring.forEach(([lon, lat], index) => { const x = (lon + 180) / 360 * 2048, y = (90 - lat) / 180 * 1024; if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.closePath(); }
    ctx.fill('evenodd'); ctx.stroke();
  }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}
function GlobeObjects({ geography, places, highlighted, selected, onSelect, command, rotating, reduced, onInteract, onReady, onFailure }) {
  const [hovered, setHovered] = useState(null);
  const [hoverPosition, setHoverPosition] = useState([0, 0, 0]);
  const markerDistance = useRef(0);
  const controls = useRef(), points = useRef(), flight = useRef(null);
  const { camera, invalidate, gl } = useThree();
  useEffect(() => { setHovered(null); gl.domElement.style.cursor = 'grab'; }, [command, geography?.features, gl]);
  const texture = useMemo(atlasTexture, []);
  const detailRegion = geography?.region && (geography.region.geometry ? geography.region : geography.features.find(f=>f.id===geography.region.id) || geography.region);
  const detail = useMemo(()=>detailTexture(detailRegion,geography?.worldFeatures||[]),[detailRegion,geography?.worldFeatures]);
  useEffect(()=>()=>detail?.texture.dispose(),[detail]);
  useEffect(() => { onReady(); const lost = event => { event.preventDefault(); onFailure(); }; gl.domElement.addEventListener('webglcontextlost', lost); return () => { gl.domElement.removeEventListener('webglcontextlost', lost); texture.dispose(); }; }, [gl, texture, onReady, onFailure]);
  useLayoutEffect(() => {
    const dummy = new Object3D();
    places.forEach((place, index) => {
      dummy.position.fromArray(globePosition(place.latitude, place.longitude, 1.012));
      dummy.scale.setScalar((place.id === selected ? .022 : .012 + Math.min(place.photos.length, 10) * .0008)*Math.min(1,Math.max(.025,(camera.position.length()-1)/2))); dummy.updateMatrix();
      points.current.setMatrixAt(index, dummy.matrix); points.current.setColorAt(index, new Color(place.id === selected ? colors.selected : place.photos.some(p => highlighted?.has(p.id)) ? '#66ffdc' : place.photos.every(p => p.visitStatus === 'wish') ? '#c5a5ff' : colors.memory));
    });
    if (points.current) { points.current.instanceMatrix.needsUpdate = true; if (points.current.instanceColor) points.current.instanceColor.needsUpdate = true; points.current.computeBoundingSphere(); }
    invalidate();
  }, [places, highlighted, selected, invalidate]);
  useEffect(() => {
    if (!command) return;
    const from = camera.position.clone(), start = from.clone().normalize();
    let end = start.clone(), distance = from.length();
    if (command.type === 'place') { end.fromArray(globePosition(Math.max(-85, Math.min(85, command.place.latitude)), command.place.longitude)); distance = 2.4; }
    if (command.type === 'region') { end.fromArray(globePosition(Math.max(-85,Math.min(85,command.place.latitude)),command.place.longitude)); distance=command.place.distance; }
    if (command.type === 'home') { end.fromArray(globePosition(22, 110)); distance = 3.6; }
    if (command.type === 'zoom') distance = Math.max(1.015, Math.min(5.5, distance * command.factor));
    if (command.type === 'turn') { const sphere = new Spherical().setFromVector3(from); sphere.theta += command.x || 0; sphere.phi = Math.max(.08, Math.min(Math.PI - .08, sphere.phi + (command.y || 0))); end.setFromSpherical(sphere).normalize(); }
    const rotation = new Quaternion().setFromUnitVectors(start, end);
    if (reduced) { camera.position.copy(end.multiplyScalar(distance)); controls.current?.update(); flight.current = null; }
    else flight.current = { start, rotation, radius: from.length(), distance, elapsed: 0 };
    invalidate();
  }, [command, reduced, camera, invalidate]);
  useFrame((_, delta) => {
    const distanceNow=camera.position.length();
    if(points.current && Math.abs(markerDistance.current-distanceNow)>.003) {
      const factor=Math.min(1,Math.max(.025,(distanceNow-1)/2));const array=points.current.instanceMatrix.array;
      places.forEach((place,i)=>{const scale=(place.id===selected? .022:.012+Math.min(place.photos.length,10)*.0008)*factor;array[i*16]=scale;array[i*16+5]=scale;array[i*16+10]=scale;});
      points.current.instanceMatrix.needsUpdate=true;markerDistance.current=distanceNow;
    }
    const motion = flight.current;
    if (motion) {
      motion.elapsed += Math.min(delta, .05); const progress = Math.min(1, motion.elapsed / .85), eased = progress * progress * (3 - 2 * progress);
      const q = new Quaternion().identity().slerp(motion.rotation, eased);
      camera.position.copy(motion.start).applyQuaternion(q).multiplyScalar(motion.radius + (motion.distance - motion.radius) * eased);
      controls.current?.update();
      if (progress === 1) flight.current = null;
      invalidate();
    } else if (rotating && !reduced) { controls.current?.update(); invalidate(); }
  });
  return <>
    <ambientLight intensity={1.8} /><directionalLight position={[3, 4, 5]} intensity={1.4} /><directionalLight position={[-3, -1, -3]} intensity={.65} color="#93b4ae" />
    <mesh onPointerMove={event=>{if(!geography)return;const v=event.point.clone().normalize();const f=geography.features.find(f=>contains(f.geometry,Math.atan2(-v.z,v.x)*180/Math.PI,Math.asin(v.y)*180/Math.PI));setHovered(f||null);if(f)setHoverPosition(event.point.toArray());gl.domElement.style.cursor=f?'pointer':'grab';}} onPointerOut={()=>{setHovered(null);gl.domElement.style.cursor='grab';}} onClick={event => { event.stopPropagation(); if(event.delta>4 || !geography)return;const v=event.point.clone().normalize();const lat=Math.asin(v.y)*180/Math.PI,lon=Math.atan2(-v.z,v.x)*180/Math.PI;const feature=geography.features.find(f=>contains(f.geometry,lon,lat));if(feature)geography.navigate(feature); }}><sphereGeometry args={[1, 256, 192]} /><meshStandardMaterial key={detail?.texture.uuid || 'global-base'} onBeforeCompile={shader=>applyDetail(shader,detail)} customProgramCacheKey={()=>detail?'regional-detail':'global-base'} map={texture} roughness={.92} metalness={.05} /></mesh>
    {geography && <><RegionLines features={geography.features}/>{hovered&&<><RegionLines features={[hovered]} color="#f5c780"/><Html position={hoverPosition} style={{pointerEvents:'none'}}><div className="atlas-region-tooltip" role="tooltip">{hovered.name}</div></Html></>}<CityPoints cities={geography.visibleCities} selected={geography.city} onSelect={geography.chooseCity}/></>}
    <instancedMesh ref={points} args={[null, null, places.length]} key={places.length} frustumCulled={false} onClick={event => {
      event.stopPropagation(); const place = places[event.instanceId];
      if (place && new Vector3(...globePosition(place.latitude, place.longitude)).dot(camera.position) > 1.015) onSelect(place);
    }} onPointerOver={() => { gl.domElement.style.cursor = 'pointer'; }} onPointerOut={() => { gl.domElement.style.cursor = 'grab'; }}>
      <sphereGeometry args={[1, 12, 8]} /><meshBasicMaterial toneMapped={false} />
    </instancedMesh>
    <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping={false} minDistance={1.015} maxDistance={5.5} minPolarAngle={.05} maxPolarAngle={Math.PI - .05} autoRotate={rotating && !reduced && !flight.current} autoRotateSpeed={.35} onStart={() => { flight.current = null; setHovered(null); onInteract(); }} />
  </>;
}
class GlobeBoundary extends Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.error ? null : this.props.children; }
}
export default function GlobeScene(props) {
  return <GlobeBoundary onFailure={props.onFailure}><Canvas camera={{ position: globePosition(22, 110, 3.6), fov: 43, near: .001, far: 30 }} dpr={[1, 1.5]} frameloop="demand" gl={{ antialias: true, alpha: true }} fallback={<p>请使用地点列表浏览照片。</p>}>
    <GlobeObjects {...props} />
  </Canvas></GlobeBoundary>;
}

import { translate } from '../../i18n/index.js';
import MemoryMarkers from './MemoryMarkers.jsx';
import { globeInteraction, zoomGlobeDistance } from './cameraInteraction.js';
import { createSingleClick } from './singleClick.js';
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { CanvasTexture, Color, Object3D, Quaternion, SRGBColorSpace, Vector3, Spherical } from 'three';
import { globePosition } from './geo.js';
import { atlasPalette as colors } from './palette.js';
import { RegionLines, CityPoints } from './RegionLines.jsx';
import { detailTexture, applyDetail, createHoverMask, updateHoverMask } from './detailTexture.js';
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
function GlobeObjects({ cameraPosition, initialView, geography, places, highlighted, selected, onSelect, command, rotating, reduced, onInteract, onReady, onFailure }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [hoverPosition, setHoverPosition] = useState([0, 0, 0]);
  const initialCommand = useRef(command);
  const clickGate = useMemo(() => createSingleClick(), []);
  const controls = useRef(), flight = useRef(null);
  const { camera, invalidate, gl } = useThree();
  useEffect(() => { setHovered(null); gl.domElement.style.cursor = 'grab'; }, [command, geography?.features, gl]);
  useEffect(() => {
    const canvas = gl.domElement;
    const cancelDouble = event => { if (event.detail > 1) clickGate.cancel(); };
    canvas.addEventListener('pointerdown', cancelDouble, true);
    canvas.addEventListener('dblclick', clickGate.cancel, true);
    return () => { clickGate.cancel(); canvas.removeEventListener('pointerdown', cancelDouble, true); canvas.removeEventListener('dblclick', clickGate.cancel, true); };
  }, [gl, clickGate]);
  useEffect(() => { clickGate.cancel(); }, [command, geography?.features, highlighted, clickGate]);
  const texture = useMemo(atlasTexture, []);
  const hoverMask = useMemo(createHoverMask, []);
  const hoveredFeatures = useMemo(() => hovered ? [hovered] : [], [hovered]);
  useLayoutEffect(() => {
    updateHoverMask(hoverMask, hovered);
    invalidate();
  }, [hovered, hoverMask, invalidate]);
  useEffect(() => () => hoverMask.texture.dispose(), [hoverMask]);
  const detailRegion = geography?.region && (geography.region.geometry ? geography.region : geography.features.find(f=>f.id===geography.region.id) || geography.region);
  const detail = useMemo(()=>detailTexture(detailRegion,geography?.worldFeatures||[]),[detailRegion,geography?.worldFeatures]);
  useEffect(()=>()=>detail?.texture.dispose(),[detail]);
  useEffect(() => { onReady(); const lost = event => { event.preventDefault(); onFailure(); }; gl.domElement.addEventListener('webglcontextlost', lost); return () => { gl.domElement.removeEventListener('webglcontextlost', lost); texture.dispose(); }; }, [gl, texture, onReady, onFailure]);
  useEffect(() => {
    if (initialView?.position && command === initialCommand.current) return;
    if (!command) return;
    if (command.type === 'restore') { flight.current = null; camera.position.fromArray(command.position); controls.current?.update(); if (cameraPosition) cameraPosition.current = camera.position.toArray(); invalidate(); return; }
    const from = camera.position.clone(), start = from.clone().normalize();
    let end = start.clone(), distance = from.length();
    if (command.type === 'place') { end.fromArray(globePosition(Math.max(-85, Math.min(85, command.place.latitude)), command.place.longitude)); distance = 2.4; }
    if (command.type === 'region') { end.fromArray(globePosition(Math.max(-85,Math.min(85,command.place.latitude)),command.place.longitude)); distance=command.place.distance; }
    if (command.type === 'home') { end.fromArray(globePosition(22, 110)); distance = 3.6; }
    if (command.type === 'zoom') distance = zoomGlobeDistance(distance, command.factor);
    if (command.type === 'turn') { const sphere = new Spherical().setFromVector3(from); sphere.theta += command.x || 0; sphere.phi = Math.max(.08, Math.min(Math.PI - .08, sphere.phi + (command.y || 0))); end.setFromSpherical(sphere).normalize(); }
    const rotation = new Quaternion().setFromUnitVectors(start, end);
    if (reduced) { camera.position.copy(end.multiplyScalar(distance)); controls.current?.update(); flight.current = null; }
    else flight.current = { start, rotation, radius: from.length(), distance, elapsed: 0 };
    invalidate();
  }, [command, reduced, camera, invalidate]);
  useFrame((_, delta) => {
    if (cameraPosition) cameraPosition.current = camera.position.toArray();
    const distanceNow=camera.position.length();
    if (controls.current) Object.assign(controls.current, globeInteraction(distanceNow));
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
    <ambientLight intensity={1.65} /><directionalLight position={[3, 4, 5]} intensity={1.05} /><directionalLight position={[-3, -1, -3]} intensity={.4} color="#b7c8cf" />
    <mesh onPointerMove={event=>{if(!geography || event.buttons)return;const v=event.point.clone().normalize();const f=geography.features.find(f=>contains(f.geometry,Math.atan2(-v.z,v.x)*180/Math.PI,Math.asin(v.y)*180/Math.PI));setHovered(f||null);if(f)setHoverPosition(event.point.toArray());gl.domElement.style.cursor=f?'pointer':'grab';}} onPointerOut={()=>{setHovered(null);gl.domElement.style.cursor='grab';}} onClick={event => { event.stopPropagation(); if(event.delta>4 || !geography)return;const v=event.point.clone().normalize();const lat=Math.asin(v.y)*180/Math.PI,lon=Math.atan2(-v.z,v.x)*180/Math.PI;const feature=geography.features.find(f=>contains(f.geometry,lon,lat));if(feature)clickGate.run(event.nativeEvent?.detail || 1, () => geography.navigate(feature)); }}><sphereGeometry args={[1, 256, 192]} /><meshStandardMaterial key={detail?.texture.uuid || 'global-base'} onBeforeCompile={shader=>applyDetail(shader,detail,hoverMask)} customProgramCacheKey={()=>detail?'regional-detail':'global-base'} map={texture} roughness={1} metalness={0} /></mesh>
    {geography && <><RegionLines features={geography.features}/>{hovered&&<><RegionLines features={hoveredFeatures} color={colors.hover} opacity={.75}/><Html position={hoverPosition} style={{pointerEvents:'none'}}><div className="atlas-region-tooltip" role="tooltip">{hovered.name}</div></Html></>}<CityPoints cities={geography.visibleCities} selected={geography.city} onSelect={(city, event) => { if (event.delta <= 4) clickGate.run(event.nativeEvent?.detail || 1, () => geography.chooseCity(city)); }}/></>}
    <MemoryMarkers places={places} highlighted={highlighted} hovered={hoveredPoint} reduced={reduced} onClick={event => {
      event.stopPropagation(); if (event.delta > 4) return; const place = places[event.instanceId];
      if (place?.photos.some(p => highlighted?.has(p.id)) && new Vector3(...globePosition(place.latitude, place.longitude)).dot(camera.position) > 1.0015) clickGate.run(event.nativeEvent?.detail || 1, () => onSelect(place, { position:camera.position.toArray() }));
    }} onPointerMove={event => { const place=places[event.instanceId]; if (!place?.photos.some(p => highlighted?.has(p.id)) || new Vector3(...globePosition(place.latitude,place.longitude)).dot(camera.position)<=1.0015) return; event.stopPropagation(); setHovered(null); setHoveredPoint(place.id); gl.domElement.style.cursor='pointer'; }} onPointerOut={() => { setHoveredPoint(null); gl.domElement.style.cursor='grab'; }}>
</MemoryMarkers>
    {hoveredPoint && places.filter(p => p.id === hoveredPoint && p.photos.some(photo => highlighted?.has(photo.id))).map(place => <Html key={place.id} position={globePosition(place.latitude,place.longitude,1.025)} style={{pointerEvents:'none'}}><div className="atlas-region-tooltip atlas-memory-tooltip" role="tooltip">{place.name}<br/>{place.photos.length}{' '}{translate("i18n.pinsClickToView")}</div></Html>)}
    <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping={false} minDistance={1.015} maxDistance={5.5} minPolarAngle={.05} maxPolarAngle={Math.PI - .05} autoRotate={rotating && !reduced && !flight.current} autoRotateSpeed={.35} onStart={() => { if (controls.current) Object.assign(controls.current, globeInteraction(camera.position.length())); flight.current = null; setHovered(null); onInteract(); }} />
  </>;
}
class GlobeBoundary extends Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.error ? null : this.props.children; }
}
export default function GlobeScene(props) {
  return <GlobeBoundary onFailure={props.onFailure}><Canvas camera={{ position: props.initialView?.position || globePosition(22, 110, 3.6), fov: 43, near: .001, far: 30 }} dpr={[1, 1.5]} frameloop="demand" gl={{ antialias: true, alpha: true }} fallback={<p>{translate("i18n.useThePlaceListToBrowsePhotos")}</p>}>
    <GlobeObjects {...props} />
  </Canvas></GlobeBoundary>;
}

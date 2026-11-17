import { bookSize } from './shelfArrangement.js';
import { itemClickDelay } from '../features/ContentCommands.jsx';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box3, Vector3, CanvasTexture, SRGBColorSpace } from 'three';
import { defaultPackage } from '../scenes/packages/scenePackage.js';
import { useSceneGLTF, preloadSceneGLTFs } from '../scenes/three/useSceneGLTF.js';
import { coverHue, useBookCover } from './LibraryShelf.jsx';
const configurations = [
  { id: 'shelf', ornaments: ['music','movie','stone','headphones','R5-crystal-study'] },
  { id: 'F26', ornaments: ['P30','stone-reading','R5-crystal-reading'] }
];
const previewModels = configurations.map(config => defaultPackage.models
  .filter(item => item.id === config.id || config.ornaments.includes(item.id))
  .map(item => ({ ...item, modelUrl: item.previewFile ? defaultPackage.assetUrl(item.previewFile) : item.modelUrl })));
const previewUrls = previewModels.map(items => items.map(item => item.modelUrl));
function ShelfFurniture({ shelf }) {
  preloadSceneGLTFs(previewUrls[shelf]);
  return previewModels[shelf].map(item => <Model key={item.id} item={item}/>);
}
function Model({ item }) {
  const { scene } = useSceneGLTF(item.modelUrl, 60_000);
  const { object, center, scale, bottom } = useMemo(() => {
    const object = scene.clone(true); object.rotation.fromArray(item.rotation || [0,0,0]); object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object), size = box.getSize(new Vector3());
    return { object, center: box.getCenter(new Vector3()), scale: item.width / Math.max(size.x, .001), bottom: box.min.y };
  }, [scene, item]);
  return <group position={item.position} scale={scale}><group position={[-center.x, -bottom, -center.z]}><primitive object={object}/></group></group>;
}
function Book({ book, position, orientation, onRead, onEdit, onRelate }) {
  const timer = useRef(null);
  const cancelRead = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  const read = event => {
    event.stopPropagation();
    cancelRead();
    if (event.nativeEvent.detail <= 1) timer.current = setTimeout(() => onRead(book), itemClickDelay);
  };
  const edit = event => {
    event.stopPropagation();
    cancelRead();
    onEdit();
  };
  const relate = event => {
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    cancelRead();
    onRelate?.();
  };
  const cover = useBookCover(book);
  const invalidate = useThree(state => state.invalidate);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 720;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = `hsl(${coverHue(book)} 30% 24%)`; ctx.fillRect(0,0,512,720);
    ctx.strokeStyle = '#c9b68e'; ctx.lineWidth = 2; ctx.strokeRect(30,30,452,660);
    ctx.fillStyle = '#f0e8d8'; ctx.font = 'bold 42px serif';
    const chars = [...book.title]; for(let i=0;i<Math.min(chars.length, 40);i+=8) ctx.fillText(chars.slice(i,i+8).join(''), 60, 190 + i/8*64);
    ctx.font = '22px serif'; ctx.fillText((book.author || '赛博书房').slice(0,18),60,610);
    const t = new CanvasTexture(canvas); t.colorSpace = SRGBColorSpace; return t;
  }, [book.id, book.title, book.author, cover]);
  useEffect(() => { let alive=true; if (cover) { const image = new Image(); image.onload=()=>{ if(alive) { texture.image.getContext('2d').drawImage(image,0,0,512,720); texture.needsUpdate=true; invalidate(); } }; image.src=cover; } return ()=>{alive=false;}; }, [cover,texture,invalidate]);
  useEffect(() => () => texture.dispose(), [texture]);
  const spine = useMemo(() => {
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=1024;
    const ctx=canvas.getContext('2d');ctx.fillStyle=`hsl(${coverHue(book)} 30% 24%)`;ctx.fillRect(0,0,96,1024);
    ctx.fillStyle='#f0e8d8';ctx.textAlign='center';const chars=[...book.title].slice(0,24);const font=Math.min(64,820/Math.max(1,chars.length));ctx.font=`${font}px serif`;
    chars.forEach((char,index)=>ctx.fillText(char,48,110+index*font));
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
  },[book.id,book.title]);
  useEffect(()=>()=>spine.dispose(),[spine]);
  const rotation=orientation==='flat'?[-Math.PI/2,Math.PI/2,0,'YXZ']:orientation==='spine'?[0,Math.PI/2,0]:[0,0,0];
  return <group position={position} rotation={rotation} onClick={read} onDoubleClick={edit} onContextMenu={relate}>
    <mesh><boxGeometry args={[bookSize.width,bookSize.height,bookSize.thickness]}/><meshStandardMaterial color="#e3dccb"/></mesh>
    <mesh position={[0,0,bookSize.thickness/2+.0005]}><planeGeometry args={[bookSize.width,bookSize.height]}/><meshStandardMaterial map={texture}/></mesh>
    <mesh position={[-bookSize.width/2-.0005,0,0]} rotation={[0,-Math.PI/2,0]}><planeGeometry args={[bookSize.thickness,bookSize.height]}/><meshStandardMaterial map={spine}/></mesh>
  </group>;
}
function FrameShelf() {
  const { camera, size, invalidate } = useThree();
  useEffect(() => { camera.position.set(0, 1.6, Math.max(5.8, 4.8 / (size.width / size.height))); camera.lookAt(0,1.6,0); camera.updateProjectionMatrix(); invalidate(); }, [camera, size.width, size.height, invalidate]);
  return null;
}
function SceneReady({ onReady }) { useEffect(onReady, [onReady]); return null; }
export default function ShelfModel({ shelf, placements = [], openBook, editPlacement, relatePlacement }) {
  const [loading, setLoading] = useState(true);
  const ready = useCallback(() => { setLoading(false); }, []);
  const config = configurations[shelf], base = defaultPackage.models.find(item => item.id === config.id);

  return <>{loading && <span className="model-loading" role="status">正在加载书架…</span>}<Canvas fallback={<p role="alert">当前无法显示三维书架，可使用下方列表选书和阅读。</p>} frameloop="demand" dpr={[1,1.5]} camera={{position:[0,1.6,5.8],fov:38}} gl={{alpha:true,antialias:true}} aria-label={`展示书架${shelf+1}三维模型`}>
    <FrameShelf/><ambientLight intensity={1.8}/><directionalLight position={[3,5,5]} intensity={3}/><directionalLight position={[-3,2,2]} intensity={1.5}/>
    <Suspense fallback={null}><SceneReady onReady={ready}/><group rotation={[0,-base.rotation[1],0]}><group position={[-base.position[0],0,-base.position[2]]}><ShelfFurniture shelf={shelf}/></group></group>{placements.map(entry=><Book key={entry.id} book={entry.book} position={entry.position} orientation={entry.orientation} onRead={openBook} onEdit={()=>editPlacement(entry.id)} onRelate={()=>relatePlacement?.(entry.id)}/>)}</Suspense>
    <OrbitControls target={[0,1.6,0]} enablePan={false} minDistance={4.5} maxDistance={12} minPolarAngle={Math.PI/2-.25} maxPolarAngle={Math.PI/2+.2} minAzimuthAngle={-.45} maxAzimuthAngle={.45}/>
  </Canvas></>;
}

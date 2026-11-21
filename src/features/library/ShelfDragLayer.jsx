import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Plane, Vector2, Vector3 } from 'three';
import { usePageBackMatcher } from '../../ui/useEscapeBack.js';
import { displayShelves, shelfRegions } from './sceneShelfArrangement.js';
// Pointer and HTML drag share the same ray/plane projection, including after zooming.
export function ShelfDragInput({ enabled, api, drag }) {
 const isPageBack = usePageBackMatcher();
 const {gl,camera,raycaster,invalidate}=useThree();
 const latest=useRef(api);latest.current=api;
 useEffect(()=>{
  if(!enabled)return;
  const canvas=gl.domElement,plane=new Plane(new Vector3(0,0,1),-.38),point=new Vector3(),mouse=new Vector2();
  function project(e){const r=canvas.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)return null;mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(mouse,camera);return raycaster.ray.intersectPlane(plane,point)?{x:point.x,y:point.y}:null;}
  const move=e=>{const p=project(e);latest.current.hover(p,drag.current);invalidate();};
  const up=e=>{if(e.button!==0)return;const p=project(e);const origin=drag.current?.pointerOrigin;if(origin){if(Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>5)latest.current.drop(p,drag.current);else latest.current.select?.(drag.current);}else if(latest.current.allowClickPlacement)latest.current.drop(p,null);drag.current=null;try{canvas.releasePointerCapture(e.pointerId);}catch{};};
  const over=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';move(e);};
  const drop=e=>{e.preventDefault();latest.current.drop(project(e),drag.current);drag.current=null;};
  const cancel=()=>{drag.current=null;latest.current.hover(null);};
  const key=e=>{if(isPageBack(e)){e.preventDefault();cancel();latest.current.cancel?.();}};
  canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('dragover',over);canvas.addEventListener('drop',drop);canvas.addEventListener('dragleave',cancel);window.addEventListener('dragend',cancel);window.addEventListener('keydown',key);
  return()=>{canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('dragover',over);canvas.removeEventListener('drop',drop);canvas.removeEventListener('dragleave',cancel);window.removeEventListener('dragend',cancel);window.removeEventListener('keydown',key);};
 },[enabled,gl,camera,raycaster,invalidate,drag,isPageBack]);
 return null;
}
export function ShelfAreas({ shelf, target }) {
 const zones=shelfRegions[shelf];
 const layers=[...new Set(zones.map(z=>z.layer))];
 return <group>
 {layers.flatMap(layer=>{
  const regions=zones.filter(z=>z.layer===layer).sort((a,b)=>a.x-b.x);
  const [startOfLayer, edge] = displayShelves[shelf].layerBounds?.[layer] ?? [];
  let left = startOfLayer;
  const blocked=[];
  for(const z of regions){const start=z.x-z.width/2;if(start-left>.04)blocked.push([left,start]);left=z.x+z.width/2;}
  if(edge-left>.04)blocked.push([left,edge]);
  return blocked.map(([a,b],i)=><mesh key={`blocked-${layer}-${i}`} position={[(a+b)/2,regions[0].y+.19,.32]} renderOrder={2}><planeGeometry args={[b-a,.36]}/><meshBasicMaterial color="#b8774e" transparent opacity={.10} depthWrite={false}/></mesh>);
 })}
 {zones.map(z=><mesh key={z.id} position={[z.x,z.y+z.height/2,.33]} renderOrder={3}><planeGeometry args={[z.width,z.height]}/><meshBasicMaterial color={target===z.id?'#e9cf86':'#68d5bb'} transparent opacity={target===z.id?.22:.12} depthWrite={false}/></mesh>)}
 {zones.map(z=><ZoneOutline key={z.id} zone={z}/>)}
 </group>;
}

function ZoneOutline({ zone:z }) {
 const points=useMemo(()=>new Float32Array([-z.width/2,-z.height/2,0,z.width/2,-z.height/2,0,z.width/2,z.height/2,0,-z.width/2,z.height/2,0]),[z]);
 return <lineLoop position={[z.x,z.y+z.height/2,.331]} renderOrder={4}><bufferGeometry><bufferAttribute attach="attributes-position" args={[points,3]}/></bufferGeometry><lineBasicMaterial color="#68d5bb" transparent opacity={.85}/></lineLoop>;
}

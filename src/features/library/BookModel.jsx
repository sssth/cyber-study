import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Mesh, CanvasTexture, SRGBColorSpace } from 'three';
import { translate } from '../../i18n/index.js';
import { getSelection } from '../../entities/entitySelection.js';
import { invokeCommand } from '../../ui/commands.js';
import { commandTargetMode, setCommandTargetMode } from '../../ui/commandTarget.js';
import { itemClickDelay } from '../../ui/editGesture.js';
import { bookSize } from './shelfArrangement.js';
import { coverHue, useBookArtwork } from './bookCover.js';

export default function Book({ book, position, orientation, onRead, onEdit, onRelate, organizing, onDrag, selected, preview=false, onActivate }) {
  const timer = useRef(null);
  const cancelRead = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if(organizing) cancelRead(); }, [organizing]);
  const read = event => {
    event.stopPropagation();
    cancelRead();
    if(onActivate){if(event.delta<=4)onActivate();return;}
    const mode = commandTargetMode();
    if (event.delta <= 4 && mode === 'relate' && onRelate) {
      setCommandTargetMode(null);
      relate(event);
      return;
    }
    if (event.delta <= 4 && mode === 'edit' && onEdit && !organizing) {
      setCommandTargetMode(null);
      edit(event);
      return;
    }
    if (organizing || getSelection()?.keys.has(`book:${book.id}`)) return;
    if (event.nativeEvent.detail <= 1) timer.current = setTimeout(() => onRead(book), itemClickDelay);
  };
  const edit = event => {
    event.stopPropagation();
    event.nativeEvent.__shelfBookDoubleClick=true;
    cancelRead();
    if (!preview && getSelection()?.keys.has(`book:${book.id}`)) invokeCommand('edit');
    else if (!organizing) onEdit?.();
  };
  const relate = event => {
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    cancelRead();
    onRelate?.();
  };
  const {url:cover,crop} = useBookArtwork(book);
  const invalidate = useThree(state => state.invalidate);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 720;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = `hsl(${coverHue(book)} 30% 24%)`; ctx.fillRect(0,0,512,720);
    ctx.strokeStyle = '#c9b68e'; ctx.lineWidth = 2; ctx.strokeRect(30,30,452,660);
    ctx.fillStyle = '#f0e8d8'; ctx.font = 'bold 42px serif';
    const chars = [...book.title]; for(let i=0;i<Math.min(chars.length, 40);i+=8) ctx.fillText(chars.slice(i,i+8).join(''), 60, 190 + i/8*64);
    ctx.font = '22px serif'; ctx.fillText((book.author || translate("i18n.appTitle")).slice(0,18),60,610);
    const t = new CanvasTexture(canvas); t.colorSpace = SRGBColorSpace; return t;
  }, [book.id, book.title, book.author, cover]);
  useEffect(() => { let alive=true; if (cover) { const image = new Image(); image.onload=()=>{ if(alive) { const w=image.naturalWidth,h=image.naturalHeight;
      const sw=crop ? w*crop.width/100 : Math.min(w,h*.7), sh=crop ? h*crop.height/100 : Math.min(h,w/.7);
      texture.image.getContext('2d').drawImage(image,crop?w*crop.left/100:(w-sw)/2,crop?h*crop.top/100:(h-sh)/2,sw,sh,0,0,512,720); texture.needsUpdate=true; invalidate(); } }; image.src=cover; } return ()=>{alive=false;}; }, [cover,crop,texture,invalidate]);
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
  return <group userData={{bookId:book.id}} position={position} rotation={rotation} onClick={read} onDoubleClick={edit} onContextMenu={relate} onPointerDown={event=>{if(preview||!organizing||event.button!==0)return;event.stopPropagation();cancelRead();event.target.setPointerCapture(event.pointerId);onDrag(event);}}>
    <mesh raycast={preview?()=>null:Mesh.prototype.raycast}><boxGeometry args={[bookSize.width,bookSize.height,bookSize.thickness]}/><meshStandardMaterial color="#e3dccb" emissive={selected?'#74e8c1':'#000000'} emissiveIntensity={.8}/></mesh>
    <mesh raycast={preview?()=>null:Mesh.prototype.raycast} position={[0,0,bookSize.thickness/2+.0005]}><planeGeometry args={[bookSize.width,bookSize.height]}/><meshStandardMaterial map={texture} emissive={selected?'#74e8c1':'#000000'} emissiveIntensity={.25}/></mesh>
    <mesh raycast={preview?()=>null:Mesh.prototype.raycast} position={[-bookSize.width/2-.0005,0,0]} rotation={[0,-Math.PI/2,0]}><planeGeometry args={[bookSize.thickness,bookSize.height]}/><meshStandardMaterial map={spine} emissive={selected?'#74e8c1':'#000000'} emissiveIntensity={.25}/></mesh>
  </group>;
}

import { useEffect, useRef, useState } from 'react';
import { translate } from '../i18n/index.js';
import './photoCrop.css';

export function cropStyle(crop) {
  if (!crop || ![crop.left, crop.top, crop.width, crop.height].every(Number.isFinite)) return {};
  return { objectViewBox: `inset(${crop.top}% ${Math.max(0,100-crop.left-crop.width)}% ${Math.max(0,100-crop.top-crop.height)}% ${crop.left}%)` };
}
export function useFilePreview(file) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}
const clamp = (value, max) => Math.max(0, Math.min(value, max));
export default function PhotoCrop({src, ratio, value, onChange}) {
  const [size,setSize] = useState(null);
  const drag = useRef(null);
  const width = Math.min(100, 100 * ratio / (size || ratio));
  const height = Math.min(100, 100 * (size || ratio) / ratio);
  const centered = { width, height, left:(100-width)/2, top:(100-height)/2 };
  const crop = value || centered;
  function zoom(amount) {
    const w = width/amount, h = height/amount;
    onChange({width:w, height:h, left:clamp(crop.left+(crop.width-w)/2,100-w), top:clamp(crop.top+(crop.height-h)/2,100-h)});
  }
  return <div className="photo-crop">
    <div className="photo-crop-frame" tabIndex="0" aria-label={translate('crop.area')} style={{aspectRatio:ratio}}
      onKeyDown={e=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key]; if(delta){e.preventDefault();e.stopPropagation();onChange({...crop,left:clamp(crop.left+delta[0],100-crop.width),top:clamp(crop.top+delta[1],100-crop.height)});}}}
      onPointerDown={e=>{if (!size || e.button!==0) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current={x:e.clientX,y:e.clientY,crop};}}
      onPointerMove={e=>{const start=drag.current;if(!start)return;const box=e.currentTarget.getBoundingClientRect();const c=start.crop;onChange({...c,left:clamp(c.left-(e.clientX-start.x)*c.width/box.width,100-c.width),top:clamp(c.top-(e.clientY-start.y)*c.height/box.height,100-c.height)});}}
      onLostPointerCapture={()=>{drag.current=null;}}>
      <img src={src} draggable="false" alt="" referrerPolicy="no-referrer" style={cropStyle(crop)} onLoad={e=>setSize(e.target.naturalWidth/e.target.naturalHeight)}/>
    </div>
    <label>{translate('crop.zoom')}<input type="range" min="1" max="4" step=".01" value={width/crop.width} disabled={!size} onChange={e=>zoom(Number(e.target.value))}/></label>
    <button type="button" onClick={()=>onChange(null)}>{translate('crop.center')}</button>
  </div>;
}

import { useEffect, useRef, useState } from 'react';
import '../../shared/contentAssets.js';
import { contentElements } from '../data/contentRelations.js';
const assets=globalThis.ContentAssets.repository('cyber-study-content-assets-v1');
// Invisible registration: right-click belongs to the enclosing content, not a repeated toolbar.
export default function ContentActions({type,id,title='',surface,preview=true}) {
 const ref=useRef(null),[pictures,setPictures]=useState([]);
 const key=`${type}:${id}`;
 useEffect(()=>{
  const node=ref.current;
  const element=surface?node?.closest(surface):node?.closest('.annotation-entry,.knowledge-result,.book-card,.movie-tile,.diary-entry,.memo-item,.memory-point-card,.admin-card,.knowledge-detail,.book-search-results > div')||node?.parentElement;
  if(!element)return;
  const previousTab=element.getAttribute('tabindex');
  element.dataset.contentTarget=key;
  if(!element.matches('button,a,input,textarea,select')&&!element.hasAttribute('tabindex'))element.tabIndex=0;
  contentElements.set(element,{key,type,id,title:title||'未命名内容',element});
  return ()=>{if(element.dataset.contentTarget===key){delete element.dataset.contentTarget;contentElements.delete(element);if(previousTab===null)element.removeAttribute('tabindex');else element.setAttribute('tabindex',previousTab);}};
 },[key,type,id,title,surface]);
 useEffect(()=>{
  if(!preview)return;
  let alive=true,revision=0,urls=[];
  const refresh=async()=>{const version=++revision;try{const item=await assets.get(key);const shown=['diary','memo'].includes(type)?item.imageAssetIds:item.imageAssetIds.slice(0,1);const next=[];for(const id of shown){const a=await assets.asset(id);if(a)next.push(URL.createObjectURL(a.blob));}if(!alive||version!==revision){next.forEach(URL.revokeObjectURL);return;}urls.forEach(URL.revokeObjectURL);urls=next;setPictures(next);}catch{/* Original content remains usable if attachment loading fails. */}};
  refresh();window.addEventListener('cyber-content-changed',refresh);
  return ()=>{alive=false;urls.forEach(URL.revokeObjectURL);window.removeEventListener('cyber-content-changed',refresh);};
 },[key,type,preview]);
 return <span className="content-anchor" ref={ref}>{preview&&pictures.map(url=><img key={url} src={url} className="preview-image" alt={`${title}的图片`}/>)}</span>;
}

import { loadOrder, saveVisibleOrder } from '../data/contentOrder.js';
import { useEffect, useRef, useState } from 'react';
import '../../shared/contentAssets.js';
import { contentElements } from '../data/contentRelations.js';
let draggedContent = null;
const assets=globalThis.ContentAssets.repository('cyber-study-content-assets-v1');
// Invisible registration: right-click belongs to the enclosing content, not a repeated toolbar.
export default function ContentActions({type,id,title='',surface,preview=true,sortable,orderItem}) {
 const ref=useRef(null),[pictures,setPictures]=useState([]);
 const key=`${type}:${id}`;
 const createdAt = orderItem?.createdAt || orderItem?.importedAt || (type === 'diary' ? orderItem?.date : undefined);
 const orderedList = Boolean(orderItem);
 useEffect(()=>{
  const node=ref.current;
  const element=surface?node?.closest(surface):node?.closest('.annotation-entry,.knowledge-result,.book-card,.movie-tile,.diary-entry,.memo-item,.memory-point-card,.admin-card,.knowledge-detail,.book-search-results > div')||node?.parentElement;
  if(!element)return;
  const previousTab=element.getAttribute('tabindex');
  element.dataset.contentTarget=key;
  if(!element.matches('button,a,input,textarea,select')&&!element.hasAttribute('tabindex'))element.tabIndex=0;
  contentElements.set(element,{key,type,id,title:title||'未命名内容',createdAt,element});
  const previousOrder = element.style.order;
  const previousDraggable = element.getAttribute('draggable');
  const canSort = sortable ?? !element.matches('.memo-item');
  const refreshOrder = () => {
    if (sortable === false) return;
    if (!orderedList) {
      const index = loadOrder(type).indexOf(key);
      element.style.order = index < 0 ? '1000000' : String(index);
    }
    element.draggable = document.body.hasAttribute('data-item-editing') && (orderedList || type !== 'annotation') && canSort;
    const parent = element.parentElement;
    if (parent && !['flex', 'grid', 'inline-flex', 'inline-grid'].includes(getComputedStyle(parent).display) && canSort) parent.classList.add('sortable-content-list');
  };
  const start = event => {
    if (!element.draggable || event.target.closest('input,textarea,select')) return;
    draggedContent = { key, type, parent: element.parentElement };
    event.stopPropagation(); event.dataTransfer.setData('text/plain', key); event.dataTransfer.setData('application/x-study-item', key); event.dataTransfer.effectAllowed = 'move';
  };
  const accepts = () => element.draggable && draggedContent?.type === type && draggedContent.parent === element.parentElement && draggedContent.key !== key;
  const clearDrop = () => element.removeAttribute('data-drop-before');
  const end = () => { draggedContent = null; document.querySelectorAll('[data-drop-before]').forEach(node => node.removeAttribute('data-drop-before')); };
  const over = event => {
    if (!accepts()) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('[data-drop-before]').forEach(node => { if (node !== element) node.removeAttribute('data-drop-before'); });
    element.setAttribute('data-drop-before', '');
  };
  const drop = event => {
    if (!accepts()) return;
    const source = draggedContent.key;
    if (!source.startsWith(type + ':')) return;
    event.preventDefault(); event.stopPropagation();
    const siblings = [...element.parentElement.querySelectorAll('[data-content-target]')].map(node => contentElements.get(node)).filter(Boolean).filter(entry => entry.type === type && entry.element.parentElement === element.parentElement);
    try { saveVisibleOrder(type, siblings, source, key); end(); }
    catch { window.dispatchEvent(new CustomEvent('cyber-order-error', { detail: '排序保存失败，请检查本地存储空间。' })); }
  };
  refreshOrder();
  window.addEventListener('cyber-order-changed', refreshOrder);
  window.addEventListener('cyber-edit-mode-changed', refreshOrder);
  element.addEventListener('dragstart', start); element.addEventListener('dragover', over); element.addEventListener('drop', drop); element.addEventListener('dragleave', clearDrop); element.addEventListener('dragend', end);

  return ()=>{window.removeEventListener('cyber-order-changed', refreshOrder); window.removeEventListener('cyber-edit-mode-changed', refreshOrder); element.removeEventListener('dragstart', start); element.removeEventListener('dragover', over); element.removeEventListener('drop', drop); element.removeEventListener('dragleave', clearDrop); element.removeEventListener('dragend', end); element.style.order = previousOrder; if(previousDraggable === null) element.removeAttribute('draggable'); else element.setAttribute('draggable', previousDraggable); if(element.dataset.contentTarget===key){delete element.dataset.contentTarget;contentElements.delete(element);if(previousTab===null)element.removeAttribute('tabindex');else element.setAttribute('tabindex',previousTab);}};
 },[key,type,id,title,surface,sortable,createdAt,orderedList]);
 useEffect(()=>{
  if(!preview)return;
  let alive=true,revision=0,urls=[];
  const refresh=async()=>{const version=++revision;try{const item=await assets.get(key);const shown=['diary','memo'].includes(type)?item.imageAssetIds:item.imageAssetIds.slice(0,1);const next=[];for(const id of shown){const a=await assets.asset(id);if(a)next.push(URL.createObjectURL(a.blob));}if(!alive||version!==revision){next.forEach(URL.revokeObjectURL);return;}urls.forEach(URL.revokeObjectURL);urls=next;setPictures(next);}catch{/* Original content remains usable if attachment loading fails. */}};
  refresh();window.addEventListener('cyber-content-changed',refresh);
  return ()=>{alive=false;urls.forEach(URL.revokeObjectURL);window.removeEventListener('cyber-content-changed',refresh);};
 },[key,type,preview]);
 return <span className="content-anchor" ref={ref}>{preview&&pictures.map(url=><img key={url} src={url} className="preview-image" alt={`${title}的图片`}/>)}</span>;
}

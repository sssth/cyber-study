import { useEffect, useMemo, useState } from 'react';
import { Book } from '../../reader/ShelfModel.jsx';
import { loadArrangement, arrangeBooks, carriedBooks } from '../../reader/shelfArrangement.js';
import { sampleBooks } from '../../reader/sampleBooks.js';
import { loadReaderState } from '../../data/storage.js';

export default function SceneShelfBooks({ scene, books=[], onActivate, onHover, inputActive, hidden=[] }) {
 const [revision,setRevision]=useState(0);
 useEffect(()=>{const refresh=()=>setRevision(v=>v+1);window.addEventListener('cyber-shelf-changed',refresh);window.addEventListener('storage',refresh);window.addEventListener('cyber-content-changed',refresh);return()=>{window.removeEventListener('cyber-shelf-changed',refresh);window.removeEventListener('storage',refresh);window.removeEventListener('cyber-content-changed',refresh);};},[]);
 const shelves=useMemo(()=>{
  const state=loadReaderState();
  const lookup=new Map([...sampleBooks,...books].map(book=>[book.id,{...book,title:state.books?.[book.id]?.customTitle||book.title,author:state.books?.[book.id]?.customAuthor??book.author}]));
  try{return loadArrangement(localStorage).map((entries,index)=>arrangeBooks(index,entries.filter(e=>lookup.has(e.bookId))).map(e=>({...e,book:lookup.get(e.bookId)})));}
  catch(error){console.warn('无法显示书架陈列',error);return [[],[]];}
 },[books,revision,inputActive]);
 return ['shelf','F26'].map((id,index)=>{
  const base=scene.models.find(m=>m.id===id);if(!base||hidden.includes(id))return null;
  const layout=shelves[index];
  function target(entry){
   if(entry.orientation!=='flat')return [entry];
   const bottom=layout.find(e=>e.orientation==='flat'&&Math.abs(e.position[0]-entry.position[0])<.001&&e.stackLevel===1&&Math.abs(e.position[1]-entry.position[1])<.38);
   return carriedBooks(layout,bottom?.bookId||entry.bookId);
  }
  return <group key={id} position={[base.position[0],0,base.position[2]]} rotation={[0,base.rotation?.[1]||0,0]}>
   {layout.map(entry=><group key={entry.id} userData={{sceneBookShelf:id}} onPointerMove={event=>{if(!inputActive||event.buttons)return;event.stopPropagation();const group=target(entry);onHover?.(group.length>1?`进入书堆 · ${group.length} 本书`:`阅读《${entry.book.title}》`);}} onPointerOut={()=>onHover?.(null)}><Book book={entry.book} position={entry.position} orientation={entry.orientation} preview={!inputActive} onActivate={()=>{
    if(!inputActive)return;
    const group=target(entry);
    onActivate?.(group.map(e=>e.bookId));
   }}/></group>) }
  </group>;
 });
}

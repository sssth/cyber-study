import { Component, lazy, Suspense, useMemo, useRef, useState } from 'react';
import ContentActions from '../features/ContentActions.jsx';
import { Cover } from './LibraryShelf.jsx';
import { arrangementKey, loadArrangement, arrangeBooks, shelfZones, zoneLabel, orientations, remainingCapacity } from './shelfArrangement.js';
const ShelfModel=lazy(()=>import('./ShelfModel.jsx'));
class ModelBoundary extends Component {
 state={error:false};
 static getDerivedStateFromError(){return {error:true};}
 render(){return this.state.error?<p role="alert">模型暂时无法加载，下方仍可整理书籍。<button onClick={()=>this.setState({error:false})}>重试</button></p>:this.props.children;}
}
export default function DisplayShelf({ shelf, books, openBook }) {
 const [loaded]=useState(()=>{try{return {shelves:loadArrangement(localStorage)};}catch(e){return {shelves:[[],[]],error:e.message};}});
 const [shelves,setShelves]=useState(loaded.shelves),[error,setError]=useState(loaded.error||''),[editing,setEditing]=useState(null);
 const [zone,setZone]=useState(0),[orientation,setOrientation]=useState('spine'),[chosen,setChosen]=useState([]);
 const dialog=useRef(null), rows=useRef(new Map());
 const lookup=useMemo(()=>new Map(books.map(b=>[b.id,b])),[books]);
 const entries=shelves[shelf], active=entries.filter(e=>lookup.has(e.bookId));
 const layout=useMemo(()=>{try{return {items:arrangeBooks(shelf,active)};}catch(e){return {items:[],error:e.message};}},[shelf,entries,lookup]);
 function begin(entry=null, region=0){setEditing(entry?.id||null);setZone(entry?.zone??region);setOrientation(entry?.orientation||'spine');setChosen(entry?[entry.bookId]:[]);setError('');dialog.current.showModal();}
 const others=active.filter(e=>e.id!==editing);
 const capacity=remainingCapacity(shelf,others,zone,orientation);
 function commit(next){
  try {arrangeBooks(shelf,next.filter(e=>lookup.has(e.bookId)));const all=shelves.map((s,i)=>i===shelf?next:s);localStorage.setItem(arrangementKey,JSON.stringify({version:2,shelves:all}));setShelves(all);setError('');dialog.current.close();}
  catch(e){setError(e.message||'保存失败，请重试。');}
 }
 function save(){if(!chosen.length)return;const next=entries.filter(e=>e.id!==editing);for(const bookId of chosen){if(next.some(e=>e.bookId===bookId)){setError('这本书已在此书架上。');return;}next.push({id:editing||crypto.randomUUID(),bookId,zone,orientation});}commit(next);}
 return <section className="display-arrangement">
  <div className="arrangement-toolbar"><span>{active.length} 本书 · {shelf===0?4:5} 层</span><button disabled={Boolean(loaded.error)||!books.length} onClick={()=>begin()}>摆放书籍</button></div>
  {(loaded.error||layout.error)&&<p role="alert">{loaded.error||layout.error}</p>}
  <div className="display-shelf-stage"><ModelBoundary key={shelf}><Suspense fallback={<p role="status">正在加载书架…</p>}><ShelfModel shelf={shelf} placements={layout.items.map(e=>({...e,book:lookup.get(e.bookId)}))} openBook={openBook} editPlacement={id=>begin(entries.find(e=>e.id===id))} relatePlacement={id=>rows.current.get(id)?.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}))}/></Suspense></ModelBoundary></div>
  <p className="arrangement-hint">竖放可选封面或书脊朝外；平躺的书会自动向上叠放。点击书籍阅读，双击调整摆放。</p>
  <div className="arrangement-layers">{Array.from({length:shelf===0?4:5},(_,layer)=><section key={layer}><header><h3>第 {layer+1} 层</h3><button disabled={Boolean(loaded.error)||!books.length} onClick={()=>begin(null,shelfZones[shelf].find(z=>z.layer===layer).id)}>添加书籍</button></header><div className="arrangement-books">{layout.items.filter(e=>shelfZones[shelf][e.zone].layer===layer).map(entry=><article className="arrangement-book" key={entry.id} ref={node=>{if(node)rows.current.set(entry.id,node);else rows.current.delete(entry.id);}}><button onClick={()=>openBook(lookup.get(entry.bookId))}>{lookup.get(entry.bookId).title}</button><small>{zoneLabel(shelf,entry.zone).split(' · ')[1]} · {orientations[entry.orientation]}{entry.stackLevel?` · 第 ${entry.stackLevel} 本`:''}</small><button aria-label={`调整《${lookup.get(entry.bookId).title}》摆放`} onClick={()=>begin(entry)}>调整摆放</button><ContentActions surface=".arrangement-book" type="book" id={entry.bookId} title={lookup.get(entry.bookId).title} preview={false}/></article>)}</div>{!active.some(e=>shelfZones[shelf][e.zone].layer===layer)&&<p className="arrangement-empty">还没有摆放书籍</p>}</section>)}</div>
  <dialog ref={dialog} className="shelf-picker arrangement-picker" aria-labelledby="arrangement-title"><header><h3 id="arrangement-title">{editing?'调整书籍摆放':'添加到展示书架'}</h3><button aria-label="关闭摆放设置" onClick={()=>dialog.current.close()}>×</button></header>
   <div className="arrangement-settings"><label>摆放区域<select value={zone} onChange={e=>setZone(Number(e.target.value))}>{shelfZones[shelf].map(z=><option key={z.id} value={z.id}>{zoneLabel(shelf,z.id)}</option>)}</select></label><fieldset><legend>摆放方式</legend>{Object.entries(orientations).map(([value,label])=><label key={value}><input type="radio" name="shelf-orientation" value={value} checked={orientation===value} onChange={()=>setOrientation(value)}/>{label}</label>)}</fieldset></div>
   <p role="status">当前方式还可放 {capacity} 本{orientation==='flat'?'，自动叠放，满一叠后另起一叠':''}。{!editing&&'可同时选择多本书。'}</p>
   {error&&<p role="alert">{error}</p>}
   <div className="shelf-picker-books">{books.filter(b=>!editing||chosen.includes(b.id)).map(book=>{const used=entries.some(e=>e.bookId===book.id&&e.id!==editing);return <button key={book.id} disabled={used||Boolean(editing)} aria-pressed={chosen.includes(book.id)} onClick={()=>setChosen(list=>list.includes(book.id)?list.filter(id=>id!==book.id):[...list,book.id])}><Cover book={book}/><span>{book.title}{used?' · 已在此书架':chosen.includes(book.id)?' · 已选择':''}</span></button>;})}</div>
   <footer>{editing&&<button onClick={()=>commit(entries.filter(e=>e.id!==editing))}>从书架移走</button>}<button disabled={!chosen.length||chosen.length>capacity||Boolean(loaded.error)} onClick={save}>保存摆放{!editing&&chosen.length?`（${chosen.length} 本）`:''}</button></footer>
  </dialog>
 </section>;
}

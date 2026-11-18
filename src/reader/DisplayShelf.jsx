import { editActivationProps } from '../ui/editGesture.js';
import useMapSource, {mapEntities} from '../ui/useMapSource.js';
import { useSearchScope, useSearchCount } from '../search/useSearchScope.jsx';
import { matchesItem, textMatches, hasSearch } from '../search/searchCore.js';
import { parseMarkdownContent } from './markdownReader.js';
import ShelfBookRows from './ShelfBookRows.jsx';
import { ActionWorkspace, WorkspaceActions } from '../features/ui.jsx';
import ModelLoading from '../ui/ModelLoading.jsx';
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import ContentActions from '../features/ContentActions.jsx';
import { ContentCommand } from '../features/ContentCommands.jsx';
import { arrangementKey, loadArrangement, arrangeBooks, orientations, dropBook, dropStack, dropGroup, carriedBooks, filterShelfLayout } from './shelfArrangement.js';
const GroupPreview=lazy(()=>import('./ShelfModel.jsx').then(m=>({default:m.BookGroupPreview})));
const ShelfModel=lazy(()=>import('./ShelfModel.jsx'));
class ModelBoundary extends Component {
 state={error:false};
 static getDerivedStateFromError(){return {error:true};}
 render(){return this.state.error?<p role="alert">书架暂时无法加载。<button onClick={()=>this.setState({error:false})}>重试</button></p>:this.props.children;}
}
export default function DisplayShelf({ shelf, books, openBook, onChoose, batch, onBatchDone }) {
 const [loaded]=useState(()=>{try{return {shelves:loadArrangement(localStorage)};}catch(e){return {shelves:[[],[]],error:e.message};}});
 const [shelves,setShelves]=useState(loaded.shelves),[error,setError]=useState(loaded.error||'');
 const [queue,setQueue]=useState([]),[picked,setPicked]=useState(null),[ghost,setGhost]=useState(null),[message,setMessage]=useState('');
 const [editing,setEditing]=useState(false);
 const pickedRef=useRef(null),targets=useRef(new Map());
 const lookup=useMemo(()=>new Map(books.map(b=>[b.id,b])),[books]);
 const entries=shelves[shelf],active=entries.filter(e=>lookup.has(e.bookId));
 const layout=useMemo(()=>{try{return {items:arrangeBooks(shelf,entries.filter(e=>lookup.has(e.bookId)))};}catch(e){return {items:[],error:e.message};}},[shelf,entries,lookup]);
 const scopeId=`display-shelf:${shelf}`;
 const shelfBooks=active.map(e=>lookup.get(e.bookId));
 const search=useSearchScope({id:scopeId,label:`展示书架${shelf+1} · 架上书籍`,priority:35,filters:[
  {key:'author',label:'作者',options:[...new Set(shelfBooks.map(b=>b.author).filter(Boolean))].map(v=>[v,v])},
  {key:'format',label:'导入格式',options:[...new Set(shelfBooks.map(b=>b.originalFormat||b.format).filter(Boolean))].map(v=>[v,v])}
 ]});
 const textByBook=useMemo(()=>new Map(books.map(book=>[book.id,parseMarkdownContent(book.content||'').map(b=>b.text).join('\n')])),[books]);
 const visibleIds=new Set(shelfBooks.filter(book=>matchesItem('book',book,{...search,query:''})&&textMatches([book.title,book.author,book.tags,textByBook.get(book.id)],search.query)).map(b=>b.id));
 const visibleActive=active.filter(e=>visibleIds.has(e.bookId));
 useMapSource({priority:35,entities:mapEntities('book',visibleActive.map(e=>lookup.get(e.bookId)))});
 const displayLayout=useMemo(()=>{try{return {items:hasSearch(search)?filterShelfLayout(shelf,active,visibleIds):layout.items};}catch(e){return {items:[],error:e.message};}},[layout,shelf,search,books]);
 useSearchCount(scopeId,visibleActive.length);
 useEffect(()=>{if(picked&&!queue.length&&!visibleIds.has(picked.bookId))pick(null);setGhost(null);},[search]);
 const selectedIds=queue.length?queue:carriedBooks(displayLayout.items,picked?.bookId).map(e=>e.bookId);
 const selectedBooks=picked?movingBooks(picked):[];
 function movingBooks(selection){
  const preserve=!queue.length&&displayLayout.items.find(e=>e.bookId===selection.bookId)?.orientation===selection.orientation;
  return (queue.length?queue:carriedBooks(displayLayout.items,selection.bookId).map(e=>e.bookId)).map(id=>{
   const book=lookup.get(id);return book?{...book,previewOrientation:preserve?displayLayout.items.find(e=>e.bookId===id)?.orientation:selection.orientation}:null;
  }).filter(Boolean);
 }
 function pick(bookId,mode){const old=entries.find(e=>e.bookId===bookId);const value=bookId?{id:old?.id||crypto.randomUUID(),bookId,orientation:mode||old?.orientation||'spine'}:null;pickedRef.current=value;setPicked(value);setGhost(null);return value;}
 function stop(){onBatchDone?.();setEditing(false);pick(null);setQueue([]);setMessage('');}
 function beginEdit(){if(loaded.error)return;setEditing(true);setQueue([]);pick(null);setError('');setMessage('直接拖动任意书籍；单击选中或取消，← → 切换朝向，Esc 退出。');}
 function beginCreate(){stop();onChoose(shelf,entries.map(e=>e.bookId));}
 useEffect(()=>{if(batch?.shelf===shelf&&batch.ids.length){setQueue(batch.ids);pick(batch.ids[0],batch.orientation);}},[batch?.token]);
 function commit(next){
  try{arrangeBooks(shelf,next.filter(e=>lookup.has(e.bookId)));const all=shelves.map((s,i)=>i===shelf?next:s);localStorage.setItem(arrangementKey,JSON.stringify({version:2,shelves:all}));setShelves(all);window.dispatchEvent(new Event('cyber-shelf-changed'));setError('');return true;}
  catch(e){setError(e.message||'保存失败，请重试。');return false;}
 }
 function proposal(point,selection){return queue.length?dropGroup(shelf,active,queue.map(bookId=>({bookId,id:bookId===selection.bookId?selection.id:crypto.randomUUID()})),selection.orientation,point):dropGroup(shelf,active,carriedBooks(displayLayout.items,selection.bookId),selection.orientation,point,displayLayout.items.find(e=>e.bookId===selection.bookId)?.orientation===selection.orientation);}
 function hover(point,moving){const selection=moving||pickedRef.current;if(!point||!selection){setGhost(null);return;}try{const result=proposal(point,selection);setGhost({...result.preview,books:movingBooks(selection),valid:true});setMessage('松开即可保存到此处');}catch(e){setGhost({position:[point.x,point.y,.38],orientation:selection.orientation,books:movingBooks(selection),valid:false});setMessage(e.message);}}
 function persist(point,selection){const result=proposal(point,selection);return commit([...entries.filter(e=>!lookup.has(e.bookId)),...result.entries]);}
 function drop(point,moving){const selection=moving||pickedRef.current;if(!point||!selection||loaded.error){setGhost(null);return;}try{
  if(!persist(point,selection)){setMessage('保存失败，原摆放未更改，请重试。');return;}setGhost(null);
  if(queue.includes(selection.bookId)){stop();}
  else {pick(selection.bookId,selection.orientation);setMessage('位置已保存，可继续拖动其他书籍。');}
 }catch(e){setGhost(null);setMessage(e.message);}}
 function turn(mode){const selection=pick(picked.bookId,mode),old=displayLayout.items.find(e=>e.bookId===selection.bookId);if(!old)return;try{if(persist({x:old.position[0],y:old.position[1]},selection))setMessage('朝向已保存，可继续拖动。');}catch(e){setMessage(`${e.message} 拖到合适位置后保存此朝向。`);}}
 function finish(){const old=displayLayout.items.find(e=>e.bookId===picked?.bookId);if(old&&old.orientation!==picked.orientation){try{if(!persist({x:old.position[0],y:old.position[1]},picked))return;}catch(e){setMessage(e.message);return;}}stop();}
 const dragApi={allowClickPlacement:queue.length>0,hover:(point,moving)=>{if(moving||queue.length)hover(point,moving);},drop,cancel:stop,
 select:entry=>{pick(pickedRef.current?.bookId===entry.bookId?null:entry.bookId);},
 start:entry=>({...entry,orientation:pickedRef.current?.bookId===entry.bookId?pickedRef.current.orientation:entry.orientation})};
 useEffect(()=>{if(!editing&&!picked)return;const key=event=>{
  if(event.target.closest?.('input,textarea,select,[contenteditable]'))return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();stop();}
  else if(picked&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const modes=Object.keys(orientations);turn(modes[(modes.indexOf(picked.orientation)+(event.key==='ArrowRight'?1:modes.length-1))%modes.length]);}
 };window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[editing,picked,entries]);
 const relay=(id,type)=>targets.current.get(id)?.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,button:type==='contextmenu'?2:0}));
 return <section className="display-arrangement">
  <ContentCommand kind="create" label="从书库选书上架" disabled={Boolean(loaded.error)} run={beginCreate}/>
  {queue.length>0&&<ContentCommand kind="cancel-create" label="取消尚未摆放的书籍" run={stop}/>}
  {(error||layout.error||displayLayout.error)&&<p role="alert">{error||layout.error||displayLayout.error}</p>}
  <ActionWorkspace command={false} showTrigger={false} title={queue.length?'新建陈列':'编辑陈列'} open={editing||Boolean(picked)} onOpenChange={open=>{if(!open)stop();}}>
   {!picked&&<><p className="shelf-book-count">{visibleActive.length} 本书</p><ShelfBookRows books={visibleActive.map(e=>lookup.get(e.bookId))} onToggle={book=>pick(book.id)} actionLabel="编辑"/><WorkspaceActions><button onClick={finish}>完成</button></WorkspaceActions></>}
   {picked&&lookup.has(picked.bookId)&&<><div className="shelf-workspace-preview"><Suspense fallback={null}><GroupPreview books={selectedBooks} orientation={picked.orientation}/></Suspense></div>
   <ShelfBookRows books={selectedBooks}/>
   <WorkspaceActions><button onClick={queue.length?()=>{if(ghost?.valid)drop({x:ghost.position[0],y:ghost.position[1]},picked);}:finish} disabled={queue.length>0&&!ghost?.valid}>确认</button><button onClick={()=>{if(queue.length)stop();else if(commit(entries.filter(e=>!selectedIds.includes(e.bookId))))pick(null);}}>{queue.length?'取消':'移出书架'}</button></WorkspaceActions>
   </>}
  </ActionWorkspace>
  <div className="display-shelf-stage" {...editActivationProps(event=>{if(event.nativeEvent.__shelfBookDoubleClick)return;event.stopPropagation();if(queue.length)return;if(editing)finish();else beginEdit();})}><ModelBoundary key={shelf}><Suspense fallback={<ModelLoading/>}><ShelfModel shelf={shelf} placements={displayLayout.items.map(e=>({...e,book:lookup.get(e.bookId)}))} selectedBookId={picked?.bookId} organizing={editing||Boolean(picked)} dragApi={dragApi} ghost={ghost} openBook={openBook} editPlacement={beginEdit} relatePlacement={id=>relay(id,'contextmenu')}/></Suspense></ModelBoundary></div>
  <div className="shelf-content-targets" role="group" aria-label="架上书籍">{visibleActive.map(entry=><div key={entry.id} data-edit-item className="shelf-content-target" ref={node=>{if(node)targets.current.set(entry.id,node);else targets.current.delete(entry.id);}}><button data-item-open onClick={()=>openBook(lookup.get(entry.bookId))}>{lookup.get(entry.bookId).title}</button><ContentCommand label={`编辑《${lookup.get(entry.bookId).title}》摆放`} run={()=>beginEdit(entry.id)}/><ContentActions surface=".shelf-content-target" type="book" id={entry.bookId} title={lookup.get(entry.bookId).title} preview={false}/></div>)}</div>

 </section>;
}

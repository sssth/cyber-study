import EntityCatalog from '../../src/features/EntityCatalog.jsx';
import ContentCommands from '../../src/features/ContentCommands.jsx';
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {ActionWorkspace} from '../../src/features/ui.jsx';
import MapProjection from '../../src/features/MapProjection.jsx';
import {DiaryPanel,MemoBoard} from '../../src/features/DiaryMemo.jsx';
import GlobePanel from '../../src/features/GlobePanel.jsx';
import TypewriterPanel from '../../src/features/TypewriterPanel.jsx';
import {MusicPlayer,MovieCollection} from '../../src/features/MediaCollections.jsx';
import ExcerptAnnotations from '../../src/reader/ExcerptAnnotations.jsx';
import ReaderOverlay from '../../src/reader/ReaderOverlay.jsx';
import ContentRelationshipPanel from '../../src/features/ContentRelationshipPanel.jsx';
import LibraryShelf from '../../src/reader/LibraryShelf.jsx';
import GlobalSearch from '../../src/search/GlobalSearch.jsx';
import UnifiedSearch from '../../src/search/UnifiedSearch.jsx';
import {saveSpaceData} from '../../src/data/spaceStorage.js';
import {currentMapSource} from '../../src/data/mapProjection.js';
import {setSearch} from '../../src/search/searchStore.js';
import '../../src/styles/global.css';import '../../src/styles/features.css';import '../../src/styles/reader.css';import '../../src/styles/immersive.css';
const photos=['p1','p2','p3','p4'].map((id,i)=>({id,title:id,latitude:30+i,longitude:110+i,locationStatus:'confirmed',visitStatus:'visited'}));
window.cyberStudy={globe:async()=>({photos,journeys:[{id:'j1',title:'旅途甲',pointIds:['p1','p2']},{id:'j2',title:'旅途乙',pointIds:['p3']}]}),onGlobeProgress:()=>()=>{}};
const books=Array.from({length:45},(_,i)=>({id:'b'+i,createdAt:new Date(Date.UTC(2026,10,16)-i*86400000).toISOString(),title:'测试书'+i,author:'作者',content:'# 测试章节\n\n测试摘录及其上下文'}));
saveSpaceData('typewriter',[{id:'w1',title:'完成',text:'甲',status:'completed'},{id:'w2',title:'未完成',text:'乙',status:'in_progress'}]);
saveSpaceData('movies',[{id:'f1',createdAt:'2026-11-15T12:00:00Z',title:'影片甲'},{id:'f2',title:'影片乙'}]);
saveSpaceData('playlists',[{id:'l1',title:'歌单甲'},{id:'l2',title:'歌单乙'}]);
saveSpaceData('music',[{id:'s1',title:'歌曲甲',playlists:[{id:'l1',title:'歌单甲'}]},{id:'s2',title:'歌曲乙',playlists:[{id:'l2',title:'歌单乙'}]}]);
saveSpaceData('diary',Array.from({length:4},(_,i)=>({id:'d'+i,date:`2026-11-${10+i}T00:00:00Z`,text:i<2?'甲日记':'乙日记'})));
saveSpaceData('memo',[{id:'m1',type:'sticky',text:'板上',showOnBoard:true,x:0,y:0},{id:'m2',type:'sticky',text:'板外',showOnBoard:false,x:0,y:0},{id:'t1',type:'todo',text:'待办',showOnBoard:true,x:40,y:40}]);
saveSpaceData('content-relations',[
 ...Array.from({length:4},(_,i)=>({id:'diary-link-'+i,fromId:'diary:d'+i,toId:'memory_point:p'+(i+1),relationType:'related'})),
 {id:'memo-link-1',fromId:'memo:m1',toId:'memory_point:p1',relationType:'related'},{id:'memo-link-2',fromId:'memo:m2',toId:'memory_point:p2',relationType:'related'},{id:'todo-link',fromId:'todo:t1',toId:'memory_point:p3',relationType:'related'},
 {id:'book-link',fromId:'book:b44',toId:'memory_point:p4',relationType:'related'}]);
const shortcuts={previousTrack:['Shift+←'],nextTrack:['Shift+→'],toggleMusic:['Shift+Space'],showOnGlobe:['Shift+Cmd+X'],search:['Shift+Cmd+Z']};
window.mapScope=()=>currentMapSource();window.filterPreview=(id,query)=>setSearch(id,{query,filters:{}});
function CatalogPreview({onClose}) {
 const [editing,setEditing]=useState(null);
 return <><EntityCatalog books={books} editing={editing} onEdit={setEditing} onOpen={onClose} onClose={onClose}/>
  <MusicPlayer catalogItem={['music','playlist'].includes(editing?.type)?editing:null} onCatalogClose={()=>setEditing(null)} navigation={{}} shortcuts={shortcuts} open={false}/></>;
}
function Preview(){const[page,setPage]=useState('memo'),[active,setActive]=useState(false),[edit,setEdit]=useState(false),[draft,setDraft]=useState('未保存内容');window.previewPage=setPage;window.previewEdit=()=>setEdit(true);
 return <main className="app-shell"><div key={page}>{page==='catalog'?<CatalogPreview onClose={()=>setPage('scene')}/>:page==='memo'?<MemoBoard shortcuts={shortcuts} onClose={()=>setPage('scene')}/>:page==='diary'?<DiaryPanel onClose={()=>setPage('scene')}/>:page==='globe'?<GlobePanel onClose={()=>setPage('scene')}/>:page==='typewriter'?<TypewriterPanel onClose={()=>{}}/>:page==='movie'?<MovieCollection onClose={()=>{}}/>:page==='music'?<MusicPlayer open navigation={{}} shortcuts={shortcuts} onClose={()=>{}}/>:page==='annotations'?<ExcerptAnnotations notes={[{id:'n1',quote:'摘录',annotation:'批注甲'},{id:'n2',quote:'摘录',annotation:'批注乙'}]} onChange={()=>{}}/>:page==='reader'?<ReaderOverlay initialBookId='b0' importedBooks={[{...books[0],content:'# 第一章\n\n正文'}]} initialView='last' shortcuts={{readerBack:['Esc']}} onClose={()=>{}}/>:page==='library'?<LibraryShelf books={books} visibleBooks={books} readerState={{books:{}}} openBook={()=>{}}/>:null}</div>
 <ActionWorkspace command={false} showTrigger={false} title="编辑验证" open={edit} onOpenChange={setEdit}><input aria-label="待保存内容" value={draft} onChange={e=>setDraft(e.target.value)}/></ActionWorkspace>
 <ContentRelationshipPanel books={books} onNavigate={()=>{}}/>
 <GlobalSearch books={books} enabled={page==='scene'} onOpen={()=>{}}/>
 <ContentCommands shortcuts={shortcuts} disabled={active} viewKey={page}/>
 <MapProjection shortcuts={shortcuts} disabled={false} onOpen={()=>{}} onActiveChange={setActive}/>
 <UnifiedSearch shortcuts={shortcuts} disabled={active} viewKey={page}/></main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Preview/></React.StrictMode>);

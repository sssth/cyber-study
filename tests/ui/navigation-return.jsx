import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoBoard} from '../../src/features/DiaryMemo.jsx';
import TypewriterPanel from '../../src/features/TypewriterPanel.jsx';
import ContentCommands from '../../src/features/ContentCommands.jsx';
import {blocksPageBack} from '../../src/ui/useEscapeBack.js';
import UnifiedSearch from '../../src/search/UnifiedSearch.jsx';
import ReaderOverlay from '../../src/reader/ReaderOverlay.jsx';
import {sampleBooks} from '../../src/reader/sampleBooks.js';
import {captureViews,restoreViews,clearRestoredViews,createReturnPoint} from '../../src/data/viewNavigation.js';
import '../../src/styles/global.css';import '../../src/styles/features.css';import '../../src/styles/reader.css';import '../../src/styles/immersive.css';
function Preview(){
 const [page,setPage]=useState('memo'),[revision,setRevision]=useState(0);
 const reader = useRef(null);
 const previous=useRef(createReturnPoint());
 window.navigatePreview=next=>{previous.current.remember({page,views:captureViews()});clearRestoredViews();setPage(next);setRevision(v=>v+1);};
 window.resetPreview=next=>{previous.current.clear();clearRestoredViews();setPage(next);setRevision(v=>v+1);};
 useEffect(()=>{const back=e=>{if(e.key!=='Escape'||reader.current?.()?.localBack||!previous.current.has()||blocksPageBack(e))return;e.preventDefault();e.stopImmediatePropagation();const origin=previous.current.take();restoreViews(origin.views);setPage(origin.page);setRevision(v=>v+1);};window.addEventListener('keydown',back,true);return()=>window.removeEventListener('keydown',back,true);},[]);
 const close=()=>{clearRestoredViews();setPage('scene');};
 return <main className="app-shell" data-page={page} key={revision}>{page==='memo'?<MemoBoard shortcuts={{}} onClose={close}/>:page==='typewriter'?<TypewriterPanel onClose={close}/>:page==='reader'?<ReaderOverlay navigationRef={reader} initialBookId={sampleBooks[0].id} initialView="paged" shortcuts={{readerBack:['Esc']}} onClose={close}/>:<div>场景</div>}<ContentCommands shortcuts={{createContent:['Shift+Cmd+A']}} viewKey={page}/><UnifiedSearch shortcuts={{search:["Shift+Cmd+Z"]}} viewKey={page}/></main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Preview/></React.StrictMode>);

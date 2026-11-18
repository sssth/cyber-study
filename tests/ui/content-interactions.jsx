import TypewriterPanel from '../../src/features/TypewriterPanel.jsx';
import {DiaryPanel,MemoBoard} from '../../src/features/DiaryMemo.jsx';
import {MusicPlayer,MovieCollection} from '../../src/features/MediaCollections.jsx';
import '../../src/styles/global.css';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import ContentCommands from '../../src/features/ContentCommands.jsx';
import LibraryShelf from '../../src/reader/LibraryShelf.jsx';
import {ActionWorkspace} from '../../src/features/ui.jsx';
import '../../src/styles/scene.css';import '../../src/styles/reader.css';import '../../src/styles/features.css';import '../../src/styles/immersive.css';
function Check(){const [books,setBooks]=useState([{id:'file:a',title:'甲书'},{id:'file:b',title:'乙书'},{id:'file:c',title:'丙书'}]);return <main className="app-shell"><section className="reader-overlay"><div className="reader-shell library-mode"><div className="reader-library"><ActionWorkspace label="添加书籍"><button>导入文件</button></ActionWorkspace><LibraryShelf books={books} visibleBooks={books} readerState={{books:{}}} openBook={()=>{}} renameBook={async(book,value)=>setBooks(rows=>rows.map(b=>b.id===book.id?{...b,...value}:b))} removeBook={async book=>{setBooks(rows=>rows.filter(b=>b.id!==book.id));return true;}} canDelete/></div></div></section><ContentCommands shortcuts={{createContent:['Shift+Cmd+A']}} viewKey="check"/></main>}
const feature=new URLSearchParams(location.search).get('feature');
const shortcuts={createContent:['Shift+Cmd+A'],addTodo:['Enter'],previousTrack:['Shift+←'],nextTrack:['Shift+→'],toggleMusic:['Shift+Space']};
if(feature==='typewriter') localStorage.setItem('cyber-study.space.v1.typewriter',JSON.stringify([{id:'test-work',title:'测试作品',text:'测试正文',typedText:'测',status:'draft',createdAt:new Date().toISOString()}]));
if(feature==='memo') localStorage.setItem('cyber-study.space.v1.memo',JSON.stringify([{id:'test-memo',type:'sticky',text:'测试便签',x:30,y:30,tone:'cyan'}]));
const modules={typewriter:<TypewriterPanel onClose={()=>{}}/>,diary:<DiaryPanel onClose={()=>{}}/>,memo:<MemoBoard shortcuts={shortcuts} onClose={()=>{}}/>,movie:<MovieCollection onClose={()=>{}}/>,music:<MusicPlayer open navigation={{}} shortcuts={shortcuts} onClose={()=>{}}/>};
createRoot(document.getElementById('root')).render(<React.StrictMode>{feature?<main className="app-shell">{modules[feature]}<ContentCommands shortcuts={shortcuts} viewKey={feature}/></main>:<Check/>}</React.StrictMode>);

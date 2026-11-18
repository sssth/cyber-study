import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import UnifiedSearch from '../../src/search/UnifiedSearch.jsx';
import {useSearchScope} from '../../src/search/useSearchScope.jsx';
import {FeaturePanel} from '../../src/features/ui.jsx';
import '../../src/styles/global.css';import '../../src/styles/features.css';import '../../src/styles/immersive.css';
function Collection({id}){const search=useSearchScope({id,label:id,priority:10});return <ul data-results>{['甲书','乙书','甲音乐'].filter(title=>title.includes(search.query)).map(title=><li key={title}>{title}</li>)}</ul>;}
function Preview(){const[id,setId]=useState('书架');return <main className="app-shell"><FeaturePanel title="搜索验证" onClose={()=>{}}><button onClick={()=>setId(id==='书架'?'音乐':'书架')}>切换范围</button><Collection key={id} id={id}/></FeaturePanel><UnifiedSearch shortcuts={{search:['Shift+Cmd+Z','Ctrl+Shift+Z']}} viewKey={id}/></main>}
createRoot(document.getElementById('root')).render(<React.StrictMode><Preview/></React.StrictMode>);

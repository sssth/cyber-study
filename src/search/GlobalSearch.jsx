import useMapSource, {mapEntities} from '../ui/useMapSource.js';
import {useEffect,useRef,useState} from 'react';
import {useSearchCount,useSearchScope} from './useSearchScope.jsx';
import {matchesCatalogItem,searchValues,hasSearch} from './searchCore.js';
import {buildCatalog,contentTypes} from '../data/contentRelations.js';

export default function GlobalSearch({books,enabled,onOpen}){
 const [visible,setVisible]=useState(false),[items,setItems]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[limit,setLimit]=useState(40),[revision,setRevision]=useState(0);
 const version=useRef(0);
 const state=useSearchScope({id:'global',label:'整个书房',priority:0,enabled,filters:[{key:'type',label:'内容类型',options:Object.entries(contentTypes)},{key:'fulltext',label:'书籍正文',options:[['yes','包含书籍全文']]}],onApply:()=>{setVisible(true);setLimit(40);}});
 useEffect(()=>{if(!enabled)setVisible(false);},[enabled]);
 useEffect(()=>{const change=e=>{setVisible(e.detail.id==='global');setLimit(40);};window.addEventListener('cyber-search-visibility',change);return()=>window.removeEventListener('cyber-search-visibility',change);},[]);
 useEffect(()=>{if(!visible||!enabled)return;const v=++version.current;setLoading(true);setError('');Promise.allSettled([window.cyberStudy?.listBooks?.()||[],window.cyberStudy?.globe?.('list')||{}]).then(results=>{if(v!==version.current)return;const readBooks=results[0].status==='fulfilled'?results[0].value:[];const globe=results[1].status==='fulfilled'?results[1].value:{};setItems(buildCatalog({books:[...books,...(Array.isArray(readBooks)?readBooks:[])],globe:globe?.error?{}:globe}));if(results.some(r=>r.status==='rejected')||globe?.error)setError('部分内容读取失败，当前结果可能不完整。');setLoading(false);});return()=>{version.current++;};},[visible,enabled,books,revision]);

 const results=items.filter(item=>matchesCatalogItem(item,state)).sort((a,b)=>{const q=state.query.trim().toLowerCase();return Number(b.title.toLowerCase()===q)-Number(a.title.toLowerCase()===q)||a.title.localeCompare(b.title,'zh-CN');});
 useMapSource({priority:0,enabled,loading:visible&&hasSearch(state)&&loading,plain:!visible||!hasSearch(state),entities:visible&&hasSearch(state)?results:[]});
 useSearchCount('global',loading?null:results.length);
 if(!visible||!enabled||!hasSearch(state)||(!loading&&!error&&!results.length))return null;
 return <aside className="global-search-surface" aria-label="全局搜索结果">{loading?<p role="status">正在读取书房内容…</p>:<><div className="global-search-results">{results.slice(0,limit).map(item=><button key={item.key} onClick={()=>{setVisible(false);onOpen(item);}}><small>{contentTypes[item.type]}</small><strong>{item.title}</strong><span>{searchValues(item.type,item).flat(Infinity).filter(v=>typeof v==='string'&&v!==item.title).join(' · ').slice(0,180)}</span></button>)}</div>{results.length>limit&&<button onClick={()=>setLimit(n=>n+40)}>显示更多</button>}</>}{error&&<p role="alert">{error}<button onClick={()=>setRevision(v=>v+1)}>重试读取</button></p>}</aside>;
}

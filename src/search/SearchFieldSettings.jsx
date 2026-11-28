import {Fragment,useState} from 'react';
import {useLanguage,translate,translateFixedText} from '../i18n/index.js';
import {contentTypes} from '../entities/registry.js';
import {entityFields,settingsFieldRows} from './queryFields.js';
import {defaultEnabled,toggleDefault} from './typedFields.js';

const photoSources={book:'cover / imageAssetIds',movie:'poster',memo:'photo',diary:'photo / photos',memory_point:'hash',music:'cover / coverAssetId',playlist:'cover / coverAssetId'};
export default function SearchFieldSettings({onBack}){
 const zh=useLanguage()==='zh-CN';
 const [type,setType]=useState('book'),[,refresh]=useState(0),[error,setError]=useState(false);
 const fields=entityFields(type,true);
 const rows=settingsFieldRows(fields,zh);
 return <section className="interaction-list shortcut-settings field-settings" id="room-interactions">
   <header><h2>{zh?'搜索字段':'Search fields'}</h2><button autoFocus onClick={onBack}>{translate('i18n.backToMenu')}</button></header>
   <label>{zh?'实体类型':'Entity type'} <select value={type} onChange={e=>setType(e.target.value)}>{Object.entries(contentTypes).map(([key,label])=><option key={key} value={key}>{translate(label)}</option>)}</select></label>
   <p>{zh?'勾选普通关键词会搜索的字段。所有列出的字段都可以用 / 指定。':'Check fields to include in keyword searches. Use / to query any listed field.'}</p>
   {type==='book'&&<small>{zh?'普通关键词搜索书籍正文时，沿用当前页面的全文设置。':'Keyword searches of book text follow the current view’s full-text setting.'}</small>}
   <div className="field-settings-list">{rows.map((row,index)=>{
     const f=fields.find(item=>item.key===row.key);
     const source=f.key==='photo'?photoSources[type]:({journeys:'journey.pointIds',trackNames:'music.playlists',readingStatus:'readingStatus / progress'}[f.key]||f.sourceKey);
     return <Fragment key={f.key}>{row.group!==rows[index-1]?.group && <h3 className="search-field-group-title">{row.group}</h3>}<label><input type="checkbox" checked={defaultEnabled(f)} onChange={e=>{try{toggleDefault(f,e.target.checked);refresh(n=>n+1);setError(false);}catch{setError(true);}}}/>
       <span><strong>{zh?f.name:translateFixedText(f.name)===f.name?f.key.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('.',' · '):translateFixedText(f.name)}</strong><code>{f.key}{source!==f.key?' · '+source:''}</code></span></label></Fragment>;
   })}</div>
   {error&&<p role="alert">{zh?'设置保存失败':'Could not save settings'}</p>}
 </section>;
}

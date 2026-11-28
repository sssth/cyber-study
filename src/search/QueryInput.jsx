import {expressionState} from './filterExpression.js';
import {Fragment,useId,useEffect,useRef,useState} from 'react';
import {translate,translateFixedText,useLanguage} from '../i18n/index.js';
import {parseQuery,precedence,slashCommand} from './logicQuery.js';
import {choices as fieldChoices,rangeKey} from './typedFields.js';
import {scopeFields,fieldMenuRows,valueKey,canonicalField,acceptsField} from './queryFields.js';

export function queryIssue(query,fields,relatedSearch) {
 const parsed=parseQuery(query,relatedSearch);
 if(!fields.length)return '';
 if(parsed.fields.some(name=>!fields.some(f=>name==='type'?f.entityQuery:acceptsField(f,name))))return 'unknown';
 return parsed.error?'unfinished':'';
}

function canAppendRelated(prefix) {
 const unquoted=prefix.replace(/"[^"]*"/g,'');
 const depth=(unquoted.match(/\(/g)||[]).length-(unquoted.match(/\)/g)||[]).length;
 return !parseQuery(prefix+' RELATED'+')'.repeat(Math.max(0,depth)),true).error;
}

export default function QueryInput({scope,value,onEdit,inputRef,keyHandler}) {
 const lang=useLanguage();
 const chinese=lang==='zh-CN';
 const {predicate,options}=expressionState(value,scope);
 const fields=scopeFields(scope,options);
 const [caret,setCaret]=useState(value.length),[dismissed,dismiss]=useState(false),[index,select]=useState(0);
 const composing=useRef(false),list=useRef(null);
 const id=useId();
 const before=value.slice(0,caret);
 const slash=slashCommand(before);
 const prefix=slash?.prefix??before;
 const pending=(prefix.match(/"/g)||[]).length%2===0 && prefix.match(/(?:^|[\s(])([^\s():：]+)[:：]$/u);
 const allowType=fields.some(f=>f.entityQuery);
 const choosingType=allowType && ((pending && canonicalField(pending[1])==='type')||/(?:^|[\s(])TYPE\s+$/.test(prefix) && (prefix.match(/"/g)||[]).length%2===0);
 const target=choosingType?{key:'type'}:pending && fields.find(f=>acceptsField(f,canonicalField(pending[1])));
 const empty=Boolean(target);
 const range=target && rangeKey(target.key);
 const afterLower=/(?:^|[\s(])([\w.]+):\s*FROM\s+([^\s()]+)\s*$/i.exec(prefix);
 const upper=afterLower && rangeKey(valueKey(afterLower[1]));
 const open=fields.length>0 && !dismissed && (Boolean(slash)||empty) && !composing.current;
 const afterCondition=prefix.trim()&&!/(?:\b(?:AND|NOT|OR)|\()$/.test(prefix.trim());
 const operatorRows=[
   ['AND','同时满足','Match both',afterCondition&&!empty],
   ['OR','满足其一','Match either',afterCondition&&!empty],
   ['NOT','排除','Exclude',!empty],
   ['NONE','为空','Empty',empty&&!choosingType],
   ...(allowType?[['TYPE','实体类型','Entity type',!empty]]:[]),
   ...(range||upper?[['FROM','下限','Minimum',range],['TO','上限','Maximum',range||upper]]:[]),
   ...(scope.relatedSearch?[['RELATED','包含关联','Include links',afterCondition&&!empty&&canAppendRelated(prefix)]]:[])
 ].sort(([a],[b])=>(precedence[b]??0)-(precedence[a]??0)).map(([label,zh,en,enabled])=>({label,token:label+' ',hint:chinese?zh:en,disabled:!enabled}));
 const needle=(slash?.needle||'').toLowerCase();
 const matches=row=>[row.label,row.detail,row.hint,row.terms,row.owners].some(s=>s?.toLowerCase().includes(needle));
 const columns=[
   {heading:chinese?'保留字':'Reserved words',rows:operatorRows.filter(matches)},
   {heading:empty?(chinese?'可选值':'Values'):(chinese?'字段名':'Fields'),rows:empty?Object.entries(fieldChoices[target.key]||{}).filter(([key])=>target.key!=='type'||fields.some(f=>f.type===key)).map(([key,val])=>({label:key,token:key+' ',hint:chinese?val:translateFixedText(val)})).filter(matches):fieldMenuRows(fields,chinese).filter(matches)}
 ];
 const choices=(empty?[columns[1],columns[0]]:columns).flatMap(column=>column.rows.filter(row=>!row.disabled));
 const selected=Math.min(index,Math.max(choices.length-1,0));
 function insert(row) {
   const space=slash && prefix && !/[\s(:：]$/u.test(prefix)?' ':'';
   const next=prefix+space+row.token;
   const text=next+value.slice(caret);
   dismiss(false);select(0);setCaret(next.length);onEdit(text,true);
   requestAnimationFrame(()=>{inputRef.current?.focus();inputRef.current?.setSelectionRange(next.length,next.length);});
 }
 function change(el,commit){
   const pos=el.selectionStart??el.value.length;
   const menu=slashCommand(el.value.slice(0,pos));
   setCaret(pos);dismiss(false);select(0);onEdit(el.value,commit&&!(fields.length&&menu));
 }
 keyHandler.current=e=>{
   if(e.target!==inputRef.current||!open||e.isComposing||composing.current)return false;
   if(e.key==='Escape'){dismiss(true);if(slash)onEdit(prefix+value.slice(caret),true);}
   else if(e.key==='ArrowDown'||e.key==='ArrowUp'){const rows=columns.find(col=>col.rows.includes(choices[selected]))?.rows.filter(row=>!row.disabled);
     if(rows?.length)select(choices.indexOf(rows[(rows.indexOf(choices[selected])+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length]));}
   else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
     const targetColumn=columns[e.key==='ArrowRight'?1:0];
     const first=targetColumn.rows.find(row=>!row.disabled);
     if(!first||targetColumn.rows.includes(choices[selected]))return false;
     select(choices.indexOf(first));
   }
   else if(e.key==='Enter'&&choices[selected])insert(choices[selected]);
   else return false;
   e.preventDefault();e.stopImmediatePropagation();return true;
 };
 useEffect(()=>{list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});},[selected,open]);
 const issue=queryIssue(predicate,fields,scope.relatedSearch);
 return <><input ref={inputRef} type="text" role="searchbox" inputMode="search" value={value}
   aria-label={translate('i18n.search0',translate(scope.label))} aria-controls={open?id:undefined}
   aria-activedescendant={open&&choices.length?id+'-'+selected:undefined}
   title={fields.length?(chinese?'输入 / 选择字段或逻辑条件':'Type / for fields and operators'):undefined}
   onSelect={e=>setCaret(e.currentTarget.selectionStart)} onBlur={()=>dismiss(true)}
   onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={e=>{composing.current=false;change(e.currentTarget,true);}}
   onChange={e=>change(e.target,!composing.current&&!e.nativeEvent.isComposing)}/>
   {open&&<div className="search-query-menu" role="listbox" id={id} ref={list}>
     {columns.map(column=><div role="group" aria-label={column.heading} key={column.heading} className="search-query-column">
       <strong>{column.heading}</strong>
       <div className="search-query-options">{column.rows.map((row,index)=>{
         const i=choices.indexOf(row);
         return <Fragment key={row.token}>{row.group && row.group!==column.rows[index-1]?.group && <div className="search-field-group-title">{row.group}</div>}<button type="button" role="option" id={i>=0?id+'-'+i:undefined} disabled={row.disabled}
           aria-selected={i>=0&&i===selected} key={row.token} title={[row.detail,row.hint||row.owners].filter(Boolean).join(' · ')}
           onMouseDown={e=>e.preventDefault()} onClick={()=>insert(row)}>
           <span>{row.label}{row.detail&&<small>{row.detail}</small>}</span><small>{row.hint}</small>
         </button></Fragment>;
       })}</div>
     </div>)}
     {!columns.some(column=>column.rows.length)&&<small>{chinese?'没有匹配的字段或命令':'No matching fields or operators'}</small>}
   </div>}
   {!open&&issue&&<small className="search-query-hint" role="status">{issue==='unknown'?(chinese?'当前范围没有这个字段，输入 / 查看可选字段':'Unknown field in this scope. Type / for fields.'):(chinese?'请补全查询条件':'Complete the query condition')}</small>}
 </>;
}

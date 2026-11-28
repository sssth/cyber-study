import {entityTypes} from '../entities/registry.js';

import {typeNames as labels,additional,meanings} from './typedFields.js';
const names = {
 tags:'标签', author:'作者', content:'正文', quote:'摘录原文', bookTitle:'来源书名', chapterTitle:'章节标题',
 annotation:'批注', text:'正文', mood:'心情', genres:'影片类型', artist:'歌手', album:'专辑', genre:'风格',
 description:'描述', note:'备注', location:'地点', country:'国家', city:'城市', caption:'说明', filename:'文件名'
};
const titles = {book:'书名',movie:'片名',playlist:'歌单名',music:'曲名',memory_point:'名称',journey:'旅途名',typing_work:'作品标题',memo:'便签标题'};
function field(type,key) {
 const name = key==='text' && type==='excerpt' ? names.quote : key==='text' && type==='annotation' ? names.annotation : key==='title' ? titles[type] : key==='region' ? labels[type]+'.地区' : names[key];
 const commandKey=key==='quote'||key==='annotation'?'text':type==='movie'&&key==='region'?'movie.region':key;
 return {type,key:commandKey,sourceKey:key,name,owner:labels[type]};
}
// Stable English spellings can be typed or pasted in either interface language.
const aliases = {标签:'tags',作者:'author',正文:'text',摘录原文:'quote',来源书名:'bookTitle',章节标题:'chapterTitle',
 批注:'annotation',心情:'mood',影片类型:'genres',歌手:'artist',专辑:'album',风格:'genre',描述:'description',
 备注:'note',地点:'location',国家:'country',城市:'city',说明:'caption',文件名:'filename',
 书名:'book.title',片名:'movie.title',歌单名:'playlist.title',曲名:'music.title',名称:'memory_point.title',
 旅途名:'journey.title',作品标题:'typing_work.title',便签标题:'memo.title','电影.地区':'movie.region','记忆点.地区':'memory_point.region'};

const canonical=new Map(Object.entries(aliases).map(([name,alias])=>[alias.toLowerCase(),name]));
const typedLabels=new Map(Object.entries(meanings).map(([key,label])=>[label,key]));
const storageKeys=new Map([...Object.keys(names),...Object.keys(meanings),'title','region'].map(key=>[key.toLowerCase(),key]));
export const canonicalField=name=>qualifiedKeys.get(name.toLowerCase())?.name || storageKeys.get(name.toLowerCase()) || canonical.get(name.toLowerCase()) || typedLabels.get(name) || name;
export const acceptsField=(f,name)=>fieldCommand(f)===name || f.key===name || f.name===name || (f.sourceKey===name || aliases[f.name]===name) && name!=='region' || f.key==='text' && name==='正文';

// Keep the former display-name commands usable while indexing the stored property.
export function withPropertyKeys(fields, bodyKey='text') {
 const result={...fields};
 for(const [name,value] of Object.entries(fields)){
   const alias=aliases[name];
   if(alias)result[name==='正文'?bodyKey:alias==='movie.region'?alias:alias.split('.').at(-1)]=value;
 }
 const bodies=['摘录原文','批注'].filter(name=>Object.hasOwn(fields,name));
 if(bodies.length){
   result.text=bodies.map(name=>fields[name]);
   result['正文']=result.text;
 }
 return result;
}

export function entityFields(type,fulltext=false) {
 const keys = [...(titles[type]?['title']:[]),'tags',...(entityTypes[type]?.commandFields ?? entityTypes[type]?.search ?? []).filter(key=>key!=='status')];
 if(type==='book' && fulltext) keys.push('content');
 const original=keys.map(key=>({...field(type,key),defaultOn:true})).filter(item=>item.name);
 if(!Object.hasOwn(additional,type))return original;
 const extra=['createdAt',...additional[type].split(' ').filter(Boolean)];
 return [...original,...extra.map(key=>({type,key,sourceKey:key.endsWith('.status')?'status':key,name:key==='text'?({movie:'影评',journey:'旅途描述',memory_point:'记忆点说明',music:'曲目备注',playlist:'歌单描述'}[type]):meanings[key],owner:labels[type],defaultOn:false}))].map(f=>({...f,entityQuery:true}));

}
const ownersByKey=new Map();
for(const type of Object.keys(entityTypes)) {
 for(const f of entityFields(type,true)){
   if(!ownersByKey.has(f.key))ownersByKey.set(f.key,[]);
   ownersByKey.get(f.key).push(type);
 }
}

// Geographic region follows country; movie production region belongs with genres.
const menuOrder = ['tags','title','text','bookTitle','chapterTitle',
 'author','content','mood','genres','movie.region','artist',
 'country','region','city','location'];

const commonKeys=['tags','title','text','photo','createdAt','updatedAt'];
const types=Object.keys(entityTypes);
const qualifiedKeys=new Map();
for(const [key,owners] of ownersByKey){
 if(commonKeys.includes(key)||owners.length<2)continue;
 for(const type of owners){
   const name=type+'.'+key;
   qualifiedKeys.set(name.toLowerCase(),{name,key});
 }
}
export const fieldCommand=f=>qualifiedKeys.get((f.type+'.'+f.key).toLowerCase())?.name??f.key;
export const valueKey=name=>qualifiedKeys.get(name?.toLowerCase())?.key??name;

export function fieldMenuRows(fields,chinese){
 const rows=new Map();
 for(const f of fields){
   const command=fieldCommand(f);
   if(!rows.has(command)){
     const common=commonKeys.includes(f.key);
     const owners=ownersByKey.get(f.key)??[f.type];
     const ownerNames=owners.map(type=>chinese?labels[type]:type).join(' / ');
     const hint=common?(owners.length===types.length?(chinese?'全部实体':'All types'):ownerNames):'';
     const description=({title:'名称',text:'正文',region:'行政区','movie.region':'出品国家或地区'})[f.key]??f.name;
     rows.set(command,{key:f.key,label:f.key,token:command+':',detail:chinese?description:'',
       hint,owners:common?ownerNames:(chinese?f.owner:f.type),shared:common,
       group:common?(chinese?'公共字段':'Common fields'):(chinese?f.owner+'专属':f.type+' fields'),
       rank:common?0:1+types.indexOf(f.type),terms:new Set()});
   }
   rows.get(command).terms.add(f.name);
 }
 const order=row=>row.shared?commonKeys.indexOf(row.key):menuOrder.includes(row.key)?menuOrder.indexOf(row.key):menuOrder.length;
 return [...rows.values()].sort((a,b)=>a.rank-b.rank||order(a)-order(b)).map(row=>({...row,terms:[...row.terms].join(' ')}));
}
export function settingsFieldRows(fields,chinese){
 return fieldMenuRows(fields,chinese).map(row=>row.shared?row:{...row,group:chinese?'专属字段':'Specific fields'});
}

export function scopeFields(scope,filters={}) {
 const id=(scope.id||'').replace(/^projection:/,'');
 const all = type=>entityFields(type,filters.fulltext==='yes');
 if (/^(global$|entity-(catalog|graph|trash)$|related:|relations:)/.test(id))
   return (scope.filters?.find(f=>f.key==='type')?.options.map(([type])=>type) ?? Object.keys(entityTypes))
     .filter(type=>!filters.type||type===filters.type).flatMap(type=>entityFields(type,true));
 if(id==='library'||id.startsWith('display-shelf:')) return entityFields('book',true);
 if(id.startsWith('book:'))return [field('book','content')];
 if(id.startsWith('annotations:'))return all('annotation');
 if(id==='knowledge')return [...all('excerpt'),...all('annotation')];
 if(id==='diary' && scope.textOnly)return [field('diary','text')];
 if(id==='typewriter-original')return [field('typing_work','text')];
 if(id==='typewriter-source')return all('book');
 if(id==='music') {
   const target=filters.musicTarget;
   if(!target)return [...all('playlist'),...all('music')];
   const fields=[field('playlist','title'),field('playlist','tags'),field('music','title'),field('music','artist'),field('music','tags')];
   return fields.filter(f=>!target || (target==='playlist'?f.type==='playlist':f.type==='music' && f.key===(target==='artist'?'artist':'title')));
 }
 if(id==='memo')return (scope.entityView && scope.entityView!=='board'?[scope.entityView==='todo'?'todo':'memo']:['memo','todo'])
   .filter(type=>!filters.type||filters.type===type).flatMap(all);
 const types={movie:'movie',diary:'diary',typewriter:'typing_work',journey:'journey',globe:'memory_point','catalog-journey-points':'memory_point',geography:filters.searchBy==='journey'?'journey':'memory_point','projection-geography':filters.searchBy==='journey'?'journey':'memory_point'};
 return types[id]?all(types[id]):[];
}

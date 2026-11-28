(function(root){
const uid=()=>globalThis.crypto.randomUUID();
if(!root.CyberContentSchema&&typeof require==='function')require('../shared/contentSchema.js');
const definitions=root.CyberContentSchema.definitions;
function item(type,title,data={}){const now=new Date().toISOString();return {id:uid(),type,title,createdAt:now,updatedAt:now,occurredAt:null,deletedAt:null,tags:[],coverAssetId:null,imageAssetIds:[],schemaVersion:2,data};}
function seed(){const types=Object.entries(definitions).map(([id,[label,fields]])=>({id,label,fields}));const items=[item('journey','杭州 · 三日慢旅行',{description:'把沿途的风景、文字和声音收在一起',startDate:'2026-11-14',endDate:'2026-11-16',location:'杭州'}),item('memory_point','西湖的黄昏',{city:'杭州',latitude:30.25,longitude:120.15,caption:'沿湖走到天色渐暗。',visitStatus:'visited'}),item('diary','湖边的一天',{text:'坐在长椅上，记录今天的风和水。',mood:'平静',location:''}),item('music','旅行中的那首歌',{artist:'示例艺术家',provider:'demo',sourceId:'',url:''}),item('excerpt','关于远行的一段话',{quote:'这是一段用于体验关联的示例摘录。',bookId:null,position:null,starred:true,annotations:[{id:uid(),text:'想把它留在这次旅行里。'}]}),item('journey','周末散步合集',{description:'同一个记忆点，也可以属于另一个集合。',location:''})];const links=[[0,1,'contains'],[5,1,'contains'],[1,2,'related'],[1,3,'related'],[1,4,'related']].map(([a,b,type])=>({id:uid(),fromId:items[a].id,toId:items[b].id,relationType:type,position:0,note:'',createdAt:new Date().toISOString()}));return {version:1,types,items,links,assets:[]};}
function allowsDirect(parent,child){return parent==='book'&&['excerpt','typing_work'].includes(child)||parent==='excerpt'&&child==='annotation';}
function allowsContains(parent,child){return parent==='journey'&&child==='memory_point'||parent==='playlist'&&child==='music';}
function validateLink(state,fromId,toId,kind){
 if(!['direct','contains','related'].includes(kind))return '关系类型无效。';
 if(fromId===toId)return '不能将内容与自身连接。';
 const parent=state.items.find(i=>i.id===fromId),child=state.items.find(i=>i.id===toId);
 if(!parent||!child)return '连接的内容不存在。';
 if(state.links.some(l=>l.relationType===kind&&((l.fromId===fromId&&l.toId===toId)||(kind==='related'&&l.fromId===toId&&l.toId===fromId))))return '这条关系已经存在，无需重复添加。';
 if(kind==='direct'){
  if(!allowsDirect(parent.type,child.type))return '直属仅支持：书籍 → 摘录、书籍 → 抄写作品、摘录 → 批注。';
  if(state.links.some(l=>l.relationType==='direct'&&l.toId===toId))return '该内容已有直属上级，请先解除原直属关系。';
 }
 if(kind==='contains'&&!allowsContains(parent.type,child.type))return '包含仅支持：旅途 → 记忆点、歌单 → 歌曲。';
 if(kind==='related'){
  if(parent.type===child.type)return '同类型内容之间不允许关联。';
  if(allowsDirect(parent.type,child.type)||allowsDirect(child.type,parent.type))return '这两种类型应使用直属关系，不允许普通关联。';
  if(allowsContains(parent.type,child.type)||allowsContains(child.type,parent.type))return '这两种类型应使用包含关系，不允许普通关联。';
 }
 if(state.links.some(l=>(l.fromId===fromId&&l.toId===toId)||(l.fromId===toId&&l.toId===fromId)))return '这两个内容已有关系，请先解除或转换原关系。';
 if(kind!=='related'){
  const seen=new Set();function reaches(id){if(id===fromId)return true;if(seen.has(id))return false;seen.add(id);return state.links.filter(l=>['contains','direct'].includes(l.relationType)&&l.fromId===id).some(l=>reaches(l.toId));}
  if(reaches(toId))return '不能建立循环包含或直属：下级不能再成为自己的上级。';
 }
 return '';
}
function resolveDirection(current,target,direction){const parent=direction==='parent'||direction==='direct-parent';return {fromId:parent?target:current,toId:parent?current:target,relationType:direction.startsWith('direct-')?'direct':direction==='related'?'related':'contains'};}
function eligibleTargets(state,current,direction){return state.items.filter(i=>{const r=resolveDirection(current,i.id,direction);return !validateLink(state,r.fromId,r.toId,r.relationType);});}

function empty(){return {version:1,types:Object.entries(definitions).map(([id,[label,fields]])=>({id,label,fields})),items:[],links:[],assets:[],layout:{positions:{},camera:{x:20,y:20,zoom:1}},emptyStartVersion:1};}
function ensureTypes(state){const existing=new Set(state.types.map(t=>t.id));for(const t of empty().types)if(!existing.has(t.id))state.types.push(t);return state;}
function removeDefaults(state){if(state.emptyStartVersion)return false;const normalize=v=>JSON.stringify(v,(k,value)=>k==='id'?undefined:value);const defaults=seed().items;const removed=new Set(state.items.filter(i=>i.sampleKey?.startsWith('complex-v1:')||defaults.some(d=>d.type===i.type&&d.title===i.title&&normalize(d.data)===normalize(i.data))).map(i=>i.id));state.items=state.items.filter(i=>!removed.has(i.id));state.links=state.links.filter(l=>!removed.has(l.fromId)&&!removed.has(l.toId));state.emptyStartVersion=1;return removed.size>0;}
const api={uid,item,seed,validateLink,empty,removeDefaults,ensureTypes,allowsDirect,allowsContains,resolveDirection,eligibleTargets};if(typeof module!=='undefined')module.exports=api;root.AssetModel=api;
})(globalThis);

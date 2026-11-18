import { createId, loadSpaceData, saveSpaceData } from './spaceStorage.js';
import { groupExcerpts } from './knowledgeStore.js';
export const contentTypes = {book:'书籍',excerpt:'摘录',annotation:'批注',typing_work:'抄写作品',journey:'旅途',memory_point:'记忆点',playlist:'歌单',music:'歌曲',movie:'影片',diary:'日记',memo:'便签',todo:'待办'};
const reserved = new Set(['book/excerpt','book/typing_work','excerpt/annotation','journey/memory_point','playlist/music']);
export function canRelate(a,b){return Boolean(a&&b&&a.key!==b.key&&a.type!==b.type&&!reserved.has(`${a.type}/${b.type}`)&&!reserved.has(`${b.type}/${a.type}`));}
export const relationExists=(links,a,b)=>links.some(l=>l.relationType==='related'&&((l.fromId===a&&l.toId===b)||(l.fromId===b&&l.toId===a)));
export function addRelation(a,b){if(!canRelate(a,b))throw Error('这两个内容不能使用普通关联，请使用相应的直属或包含关系。');const links=loadSpaceData('content-relations',[]);if(relationExists(links,a.key,b.key))return false;const next=[...links,{id:createId('relation'),fromId:a.key,toId:b.key,fromTitle:a.title,toTitle:b.title,relationType:'related',createdAt:new Date().toISOString()}];if(!saveSpaceData('content-relations',next))throw Error('关联保存失败，请检查本地存储空间。');window.dispatchEvent(new Event('cyber-content-changed'));return true;}
export function removeRelation(id){const links=loadSpaceData('content-relations',[]);if(!saveSpaceData('content-relations',links.filter(l=>l.id!==id)))throw Error('解除关联失败，请重试。');window.dispatchEvent(new Event('cyber-content-changed'));}
export function buildCatalog({books=[],globe={}}={}){
 const result=new Map();const add=(type,item,title)=>{if(!item?.id||item.deletedAt)return;const key=`${type}:${item.id}`;result.set(key,{...item,key,id:item.id,type,title:title||item.title||item.text?.slice(0,40)||'未命名内容'});};
 books.forEach(i=>add('book',i));
 for(const [key,type] of [['movies','movie'],['music','music'],['diary','diary'],['typewriter','typing_work'],['playlists','playlist']]){const rows=loadSpaceData(key,[]);if(Array.isArray(rows))rows.forEach(i=>add(type,i,type === 'diary' ? `${new Date(i.date).toLocaleDateString('zh-CN')} 日记` : undefined));}
 loadSpaceData('memo',[]).forEach(i=>add(i.type==='todo'?'todo':'memo',i,i.text?.slice(0,40)||(i.type==='image'?'图片便签':'')));
 const notes=loadSpaceData('knowledge',{notes:[]}).notes||[];
 for(const items of groupExcerpts(notes).values()){const note=items[0];add('excerpt',note,note.quote?.slice(0,40));}
 notes.filter(n=>n.annotation).forEach(n=>add('annotation',n,n.annotation.slice(0,40)));
 (globe.photos||[]).forEach(i=>add('memory_point',i,i.title||i.location||i.filename||i.caption?.slice(0,40)));
 (globe.journeys||[]).forEach(i=>add('journey',i));
 loadSpaceData('music',[]).forEach(t=>(t.playlists||[]).forEach(p=>{if(!result.has(`playlist:${p.id}`))add('playlist',p);}));
 return [...result.values()];
}
// DOM metadata identifies the exact content under the mouse, including nested annotations.
export const contentElements=new WeakMap();
export function contentAt(target){const element=target?.closest?.('[data-content-target]');return element?.isConnected?contentElements.get(element):null;}

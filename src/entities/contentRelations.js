import { createId, loadSpaceData, saveContentData } from '../data/spaceStorage.js';
import { entityTypes } from './registry.js';

export function canRelate(a, b) {
  if (!a || !b || a.key === b.key || a.type === b.type) return false;
  const relates = (from, to) => entityTypes[from]?.parent?.type === to || entityTypes[from]?.children?.type === to;
  return !relates(a.type, b.type) && !relates(b.type, a.type);
}
export const relationExists=(links,a,b)=>links.some(l=>l.relationType==='related'&&((l.fromId===a&&l.toId===b)||(l.fromId===b&&l.toId===a)));
export function addRelation(a,b){if(!canRelate(a,b))throw Error('这两个内容不能使用普通关联，请使用相应的直属或包含关系。');const links=loadSpaceData('content-relations',[]);if(relationExists(links,a.key,b.key))return false;const next=[...links,{id:createId('relation'),fromId:a.key,toId:b.key,fromTitle:a.title,toTitle:b.title,relationType:'related',createdAt:new Date().toISOString()}];if(!saveContentData('content-relations',next))throw Error('关联保存失败，请检查本地存储空间。');return true;}
export function removeRelation(id){const links=loadSpaceData('content-relations',[]);if(!saveContentData('content-relations',links.filter(l=>l.id!==id)))throw Error('解除关联失败，请重试。');}

import { entityTags } from '../entities/tags.js';
import { entityTypes } from '../entities/registry.js';

export const emptySearch = Object.freeze({query:'', filters:{}});
export const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase();
export const termsOf = query => Array.from(normalize(query).matchAll(/"([^"]+)"|([^\s"]+)/g), m=>m[1]||m[2]);
export const textMatches = (values, query) => { const text=values.flat(Infinity).filter(v=>v!=null).map(normalize).join('\n');return termsOf(query).every(term=>text.includes(term)); };
export const searchValues = (type, item, definitions = entityTypes) =>
 [item.title, entityTags(type,item), ...(definitions[type]?.search ?? []).map(key => item[key])];
export function matchesItem(type,item,state=emptySearch, definitions=entityTypes){
 if(item.deletedAt||!textMatches(searchValues(type,item,definitions),state.query))return false;
 const f=state.filters||{};
 if(f.id&&item.id!==f.id)return false;
 if(f.type&&f.type!==type)return false;
 if(f.status&&String(item.visitStatus??item.status??(definitions[type]?.status?.(item) ?? ''))!==f.status)return false;
 if(f.bookId&&item.bookId!==f.bookId)return false;
 if(f.provider&&item.provider!==f.provider)return false;
 if(f.author&&item.author!==f.author)return false;
 if(f.format&&(item.originalFormat||item.format)!==f.format)return false;
 if(f.mood&&item.mood!==f.mood)return false;
 const rawDate=item.date||item.startDate||item.completedAt||item.createdAt||'';
 const date=String(rawDate).includes('T')&&Number.isFinite(Date.parse(rawDate))?new Date(rawDate).toLocaleDateString('sv-SE'):String(rawDate).slice(0,10);
 if(f.from&&(!date||date<f.from)||f.to&&(!date||date>f.to))return false;
 return true;
}
export const hasSearch=state=>Boolean(state.query.trim()||Object.values(state.filters||{}).some(Boolean));

export function matchesCatalogItem(item, state, definitions = entityTypes) {
 if (matchesItem(item.type, item, state, definitions)) return true;
 const field = definitions[item.type]?.fullText;
 return Boolean(field && state.filters?.fulltext === 'yes' &&
   matchesItem(item.type, item, { ...state, query: '' }, definitions) &&
   textMatches([item[field]], state.query));
}

// A query strategy receives normalized catalog entities and returns their matching subset.
export function queryEntities(items, state, matches = matchesCatalogItem) {
 return items.filter(item => matches(item, state));
}

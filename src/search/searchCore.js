export const emptySearch = Object.freeze({query:'', filters:{}});
export const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase();
export const termsOf = query => Array.from(normalize(query).matchAll(/"([^"]+)"|([^\s"]+)/g), m=>m[1]||m[2]);
export const textMatches = (values, query) => { const text=values.flat(Infinity).filter(v=>v!=null).map(normalize).join('\n');return termsOf(query).every(term=>text.includes(term)); };
const fields={book:['author'],excerpt:['quote','bookTitle','chapterTitle'],annotation:['text','annotation','bookTitle'],typing_work:['text','chapterTitle','bookTitle'],journey:['description','note'],memory_point:['location','country','region','city','caption','filename'],playlist:['description'],music:['artist','album','genre'],movie:['genres','region'],diary:['text','mood'],memo:['text'],todo:['text']};
export const searchValues=(type,item)=>[item.title,item.tags,...(fields[type]||[]).map(k=>item[k])];
export function matchesItem(type,item,state=emptySearch){
 if(item.deletedAt||!textMatches(searchValues(type,item),state.query))return false;
 const f=state.filters||{};
 if(f.id&&item.id!==f.id)return false;
 if(f.type&&f.type!==type)return false;
 if(f.status&&String(item.visitStatus??item.status??(type==='todo'?(item.done?'done':'open'):type==='typing_work'?(item.complete?'completed':'in_progress'):''))!==f.status)return false;
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

export function matchesCatalogItem(item,state){
 if(matchesItem(item.type,item,state))return true;
 return item.type==='book'&&state.filters?.fulltext==='yes'&&matchesItem('book',item,{...state,query:''})&&textMatches([item.content],state.query);
}

import {migrateEntityText} from '../../electron/entityText.mjs';
// One reading position can carry two independent bodies with the same note ID.
export function storedNote(note) {
  if (!Object.hasOwn(note, 'quote') && !Object.hasOwn(note, 'annotation')) return note;
  const {quote, annotation, ...rest} = note;
  return {...rest, excerpt: {text: quote ?? ''}, comment: {text: annotation ?? note.text ?? ''}};
}

export function readingNote(record) {
  if (!record.excerpt || !record.comment) return record;
  const {excerpt, comment, ...rest} = record;
  return {...rest, quote: excerpt.text, annotation: comment.text};
}

export function knowledgeEntity(type, record) {
  if(type !== 'excerpt' && type !== 'annotation') return record;
  const row = storedNote(record);
  if(!row.excerpt || !row.comment) return row;
  const {excerpt, comment, ...rest} = row;
  return type === 'excerpt' ? {...rest, text:excerpt.text, comment} : {...rest, text:comment.text, excerpt};
}

function mapChanged(rows, fn) {
 const next=rows.map(fn);
 return next.some((r,i)=>r!==rows[i])?next:rows;
}
function storeTrack(row){
 const track=migrateEntityText('music',row);
 if(!Array.isArray(track?.playlists))return track;
 const lists=mapChanged(track.playlists,list=>migrateEntityText('playlist',list));
 return lists===track.playlists?track:{...track,playlists:lists};
}
export function encodeCollection(key,data){
 if(key==='knowledge' && Array.isArray(data?.notes)){
   const notes=mapChanged(data.notes,storedNote);
   return notes===data.notes?data:{...data,notes};
 }
 if(!Array.isArray(data))return data;
 if(key==='movies')return mapChanged(data,row=>migrateEntityText('movie',row));
 if(key==='playlists')return mapChanged(data,row=>migrateEntityText('playlist',row));
 if(key==='music')return mapChanged(data,storeTrack);
 if(key==='recycle')return mapChanged(data,entry=>{
   if(!entry?.record)return entry;
   const record=entry.collection==='knowledge'?storedNote(entry.record):entry.type==='music'?storeTrack(entry.record):migrateEntityText(entry.type,entry.record);
   const members=Array.isArray(entry.members)?mapChanged(entry.members,m=>{
     const membership=migrateEntityText('playlist',m.membership);
     return membership===m.membership?m:{...m,membership};
   }):entry.members;
   return record===entry.record && members===entry.members?entry:{...entry,record,...(members?{members}:{})};
 });
 return data;
}

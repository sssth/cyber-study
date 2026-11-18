import { editActivationProps } from '../ui/editGesture.js';
import { useEffect, useRef } from 'react';
import { itemClickDelay } from '../features/ContentCommands.jsx';

export default function ExcerptCard({ notes, onLocate, onEdit }) {
 const timer=useRef(null),note=notes[0];
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const cancel=()=>clearTimeout(timer.current);
 return <button type="button" className="reader-excerpt-card" aria-label={`摘录：${note.quote}`} onClick={event=>{
  cancel();
  if(event.detail===0){onLocate();return;}
  if(event.detail===1)timer.current=setTimeout(onLocate,itemClickDelay);
 }} {...editActivationProps(event=>{cancel();event.preventDefault();onEdit(event);})} onKeyDown={event=>{
  if(event.key==='F2'){event.preventDefault();cancel();onEdit(event);}
 }}>
  <span className="reader-excerpt-quote">{note.quote}</span>
  <span className="reader-excerpt-meta"><time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleDateString('zh-CN')}</time><span>{notes.filter(n=>n.annotation?.trim()).length} 条批注</span></span>
 </button>;
}

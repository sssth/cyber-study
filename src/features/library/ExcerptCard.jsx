import { formatDate, translate } from '../../i18n/index.js';
import { excerptAppearance } from './knowledgeStore.js';
import { editActivationProps } from '../../ui/editGesture.js';
import { useEffect, useRef } from 'react';
import { itemClickDelay } from '../../ui/editGesture.js';

export default function ExcerptCard({ notes, onLocate, onEdit }) {
 const timer=useRef(null),note=notes[0];
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const cancel=()=>clearTimeout(timer.current);
 return <button type="button" className="reader-excerpt-card" aria-label={translate("i18n.excerpt0", note.quote)} onClick={event=>{
  cancel();
  if(event.detail===0){onLocate();return;}
  if(event.detail===1)timer.current=setTimeout(onLocate,itemClickDelay);
 }} {...editActivationProps(event=>{cancel();event.preventDefault();onEdit(event);})} onKeyDown={event=>{
  if(event.key==='F2'){event.preventDefault();cancel();onEdit(event);}
 }}>
  <span className="reader-excerpt-quote">{note.quote}</span>
  <span className="reader-excerpt-meta"><time dateTime={note.createdAt}>{formatDate(note.createdAt)}</time><span>{excerptAppearance(note).excerptType === 'hidden' && translate("i18n.hidden")}{notes.filter(n=>n.annotation?.trim()).length}{' '}{translate("i18n.annotations")}</span></span>
 </button>;
}

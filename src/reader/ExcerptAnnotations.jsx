import { ContentCommand } from '../features/ContentCommands.jsx';
import {useSearchCount,useSearchScope,SearchStatus} from '../search/useSearchScope.jsx';
import {matchesItem,hasSearch} from '../search/searchCore.js';
import { useState } from 'react';
import Annotation from '../features/Annotation.jsx';
import { addKnowledgeNote, removeExcerptAnnotation } from '../data/knowledgeStore.js';

export default function ExcerptAnnotations({ notes, onChange }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const scopeId=`annotations:${notes?.[0]?.id}`;
  const search=useSearchScope({id:scopeId,label:'当前摘录的批注',priority:40,enabled:Boolean(notes?.length)});
  useSearchCount(scopeId,(notes||[]).filter(note=>note.annotation&&matchesItem('annotation',note,search)).length);
  if (!notes?.length) return null;

  const mutate = (operation) => {
    try {
      operation();
      setError('');
      onChange();
    } catch (failure) {
      setError(failure.message);
    }
  };

  return <div className="reader-excerpt-annotations"><SearchStatus id={scopeId} label="批注"/>
    {notes.filter((note) => note.annotation&&matchesItem('annotation',note,search)).map((note) => (
      <div className="reader-annotation-card" key={note.id}>
        <Annotation note={note} onSaved={onChange} onDelete={() => mutate(() => removeExcerptAnnotation(note))} />
      </div>
    ))}
    {!adding && <ContentCommand kind="create" label="新建批注" run={() => setAdding(true)} />}
    {adding && <ContentCommand kind="cancel-create" label="取消新增批注" run={() => { setAdding(false); setDraft(''); setError(''); }} />}
    {adding && <><textarea autoFocus rows="2" aria-label="新增批注" placeholder="新增批注…" value={draft}
      onChange={(event) => setDraft(event.target.value)} />
    <button type="button" disabled={!draft.trim()} onClick={() => mutate(() => {
      addKnowledgeNote({ ...notes[0], annotation: draft.trim() });
      setDraft('');
      setAdding(false);
    })}>保存批注</button><button type="button" onClick={() => setAdding(false)}>取消</button></>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

import { useState } from 'react';
import Annotation from '../features/Annotation.jsx';
import { addKnowledgeNote, removeExcerptAnnotation } from '../data/knowledgeStore.js';

export default function ExcerptAnnotations({ notes, onChange }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
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

  return <div className="reader-excerpt-annotations">
    {notes.filter((note) => note.annotation).map((note) => (
      <div className="reader-annotation-card" key={note.id}>
        <Annotation note={note} onSaved={onChange} />
        <button type="button" className="reader-annotation-delete" aria-label="删除批注" title="删除批注" onClick={() => mutate(() => removeExcerptAnnotation(note))}>×</button>
      </div>
    ))}
    <textarea rows="2" aria-label="新增批注" placeholder="新增批注…" value={draft}
      onChange={(event) => setDraft(event.target.value)} />
    <button type="button" disabled={!draft.trim()} onClick={() => mutate(() => {
      addKnowledgeNote({ ...notes[0], annotation: draft.trim() });
      setDraft('');
    })}>添加批注</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}

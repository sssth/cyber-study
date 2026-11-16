import { useState } from 'react';
import { editKnowledgeNote } from '../data/knowledgeStore.js';

export default function Annotation({ note, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('');

  const start = () => {
    setValue(note.annotation ?? '');
    setEditing(true);
    setStatus('');
  };

  return <div className="annotation-entry">
    <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString('zh-CN')}</time>
    {editing ? <div className="stack-form">
      <textarea autoFocus aria-label="编辑批注" value={value} onChange={(event) => setValue(event.target.value)} />
      <button type="button" aria-label="保存修改" onClick={() => {
        try {
          editKnowledgeNote(note.id, value.trim());
          setEditing(false);
          setStatus('批注已保存。');
          onSaved();
        } catch (error) { setStatus(error.message); }
      }}>✓</button>
      <button type="button" onClick={() => setEditing(false)}>取消</button>
    </div> : <button type="button" className="annotation-text" title="点击文字编辑" onClick={start}>
      {note.annotation || '空白批注'}
    </button>}
    {status && <p role="status">{status}</p>}
  </div>;
}

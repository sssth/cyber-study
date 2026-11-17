import { ContentCommand, ContentEditButton } from './ContentCommands.jsx';
import ContentActions from './ContentActions.jsx';
import { useState } from 'react';
import { editKnowledgeNote } from '../data/knowledgeStore.js';

export default function Annotation({ note, onSaved, onDelete }) {
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
      {onDelete && <ContentEditButton label="删除批注" confirm run={onDelete} />}
    </div> : <>
      <p className="annotation-text">{note.annotation || '空白批注'}</p>
      <ContentCommand label={`编辑批注 · ${note.annotation?.slice(0, 40) || '空白批注'}`} run={start} />
    </>}
    {onDelete && !editing && <ContentCommand label={`删除批注 · ${note.annotation.slice(0, 40)}`} confirm run={onDelete} />}
    <ContentActions type="annotation" id={note.id} title={note.annotation?.slice(0,24)}/>{status && <p role="status">{status}</p>}
  </div>;
}

import { ContentCommand, ContentEditButton } from './ContentCommands.jsx';
import ContentActions from './ContentActions.jsx';
import { useState } from 'react';
import { editKnowledgeNote } from '../data/knowledgeStore.js';

export default function Annotation({ note, onSaved, onDelete, inlineEdit = false, editOnly = false, onCancel }) {
  const [editing, setEditing] = useState(editOnly);
  const [value, setValue] = useState(editOnly ? note.annotation : '');
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
          setStatus('');
          onSaved();
        } catch (error) { setStatus(error.message); }
      }}>✓</button>
      <button type="button" onClick={() => {setEditing(false);onCancel?.();}}>取消</button>
      {onDelete && <ContentEditButton label="删除批注" confirm run={onDelete} />}
    </div> : <>
      {inlineEdit ? <button type="button" data-instant-selection className="annotation-text" onClick={start}>{note.annotation || '空白批注'}</button> : <p className="annotation-text">{note.annotation || '空白批注'}</p>}
      <ContentCommand label={`编辑批注 · ${note.annotation?.slice(0, 40) || '空白批注'}`} run={start} />
    </>}
    {onDelete && !editing && <ContentCommand label={`删除批注 · ${note.annotation.slice(0, 40)}`} confirm run={onDelete} />}
    <ContentActions surface={inlineEdit ? ".reader-annotation-card" : undefined} orderItem={note} type="annotation" id={note.id} title={note.annotation?.slice(0,24)}/>{status && <p role="status">{status}</p>}
  </div>;
}

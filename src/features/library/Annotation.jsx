import { translate } from '../../i18n/index.js';
import { ContentCommand, ContentEditButton } from '../ContentCommands.jsx';
import ContentActions from '../ContentActions.jsx';
import { useState } from 'react';
import useEditSession from '../../ui/useEditSession.js';
import { editKnowledgeNote } from './knowledgeStore.js';

export default function Annotation({ note, onSaved, onDelete, inlineEdit = false, editOnly = false, onCancel }) {
  const [editing, setEditing] = useState(editOnly);
  const [value, setValue] = useState(editOnly ? note.annotation : '');
  const [status, setStatus] = useState('');

  const close = () => { setEditing(false); onCancel?.(); };
  useEditSession(editing && !editOnly, close, { editing: false });

  const start = () => {
    setValue(note.annotation ?? '');
    setEditing(true);
    setStatus('');
  };

  return <div className="annotation-entry" data-edit-active={editing && !editOnly || undefined}>
    <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString('zh-CN')}</time>
    {editing ? <div className="stack-form">
      <textarea autoFocus aria-label={translate("i18n.editAnnotation")} value={value} onChange={(event) => setValue(event.target.value)} />
      <button type="button" aria-label={translate("i18n.saveChanges")} onClick={() => {
        try {
          editKnowledgeNote(note.id, value.trim());
          setEditing(false);
          setStatus('');
          onSaved();
        } catch (error) { setStatus(error.message); }
      }}>✓</button>
      <button type="button" onClick={close}>{translate("i18n.cancel")}</button>
      {onDelete && <ContentEditButton label={"i18n.deleteAnnotation"} confirm run={onDelete} />}
    </div> : <>
      {inlineEdit ? <button type="button" data-instant-selection className="annotation-text" onClick={start}>{note.annotation || translate("i18n.blankAnnotation")}</button> : <p className="annotation-text">{note.annotation || translate("i18n.blankAnnotation")}</p>}
      <ContentCommand label={translate("i18n.editAnnotation0", note.annotation?.slice(0, 40) || translate("i18n.blankAnnotation"))} run={start} />
    </>}
    {onDelete && !editing && <ContentCommand label={translate("i18n.deleteAnnotation0", note.annotation.slice(0, 40))} confirm run={onDelete} />}
    <ContentActions surface={inlineEdit ? ".reader-annotation-card" : undefined} orderItem={note} type="annotation" id={note.id} title={note.annotation?.slice(0,24)}/>{status && <p role="status">{status}</p>}
  </div>;
}

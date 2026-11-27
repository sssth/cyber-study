import EntityTagsField from '../../entities/EntityTagsField.jsx';
import { translate } from '../../i18n/index.js';
import { ContentCommand, ContentEditButton } from '../ContentCommands.jsx';
import { editActivationProps } from '../../ui/editGesture.js';
import { WorkspaceActions, WorkspaceFields } from '../ui.jsx';
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

  const createdAt = note.annotationCreatedAt || note.createdAt;
  const time = createdAt ? new Date(createdAt).toLocaleString('zh-CN') : '—';
  const editor = <form className="stack-form annotation-form" onSubmit={event => {
    event.preventDefault();
    try {
      editKnowledgeNote(note.id, value.trim());
      setEditing(false);
      setStatus('');
      onSaved();
    } catch (error) { setStatus(error.message); }
  }}>
    <WorkspaceFields>
      <EntityTagsField type="annotation" item={note}/>
      <label>{translate('i18n.content')}<textarea autoFocus aria-label={translate("i18n.editAnnotation")} value={value} onChange={event => setValue(event.target.value)}/></label>
      <label>{translate('i18n.time')}<input readOnly value={time}/></label>
      {status && <p role="alert">{status}</p>}
    </WorkspaceFields>
    <WorkspaceActions>
      <button type="submit">{translate('i18n.save')}</button>
      {onDelete && <ContentEditButton label="i18n.delete" confirm run={onDelete}/>}
    </WorkspaceActions>
  </form>;

  if (editOnly) return editor;
  return <div className="annotation-entry" data-edit-active={editing || undefined}
    data-instant-selection={inlineEdit || undefined}
    {...editActivationProps(event => {
      if (event.target.closest('input, select, .edit-actions')) return;
      event.stopPropagation();
      if (editing) close(); else start();
    })}>
    {editing ? editor : <>
      <time dateTime={createdAt}>{time}</time>
      <button type="button" className="annotation-text" onClick={event => {
        if (event.detail === 0) start();
      }}>{note.annotation || translate("i18n.blankAnnotation")}</button>
      <ContentCommand label={translate("i18n.editAnnotation0", note.annotation?.slice(0, 40) || translate("i18n.blankAnnotation"))} run={start}/>
      {onDelete && <ContentCommand label={translate("i18n.deleteAnnotation0", note.annotation.slice(0, 40))} confirm run={onDelete}/>}
    </>}
    <ContentActions surface={inlineEdit ? ".reader-annotation-card" : undefined} orderItem={note} type="annotation" id={note.id} title={note.annotation?.slice(0,24)}/>
  </div>;
}

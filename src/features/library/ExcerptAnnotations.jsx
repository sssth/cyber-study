import { translate, translateError } from '../../i18n/index.js';
import useContentOrder from '../../ui/useContentOrder.js';
import { orderType } from '../../data/contentOrder.js';
import useResultSource, {resultEntities} from '../../results/useResultSource.js';
import { ContentCommand } from '../ContentCommands.jsx';
import {useSearchCount,useSearchScope,SearchStatus} from '../../search/useSearchScope.jsx';
import {matchesItem,hasSearch} from '../../search/searchCore.js';
import { useState } from 'react';
import Annotation from './Annotation.jsx';
import { addKnowledgeNote, excerptAppearance, excerptTypes, removeExcerptAnnotation, updateExcerptAppearance } from './knowledgeStore.js';

export default function ExcerptAnnotations({ notes, annotationId, onChange, onDeleteExcerpt, onHide, saving = false }) {
  const order = useContentOrder();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const scopeId=`annotations:${notes?.[0]?.id}`;
  const search=useSearchScope({id:scopeId,label:translate("i18n.annotationsForThisExcerpt"),priority:40,enabled:Boolean(notes?.length)});
  useSearchCount(scopeId,(notes||[]).filter(note=>note.annotation&&(!annotationId||note.id===annotationId)&&matchesItem('annotation',note,search)).length);
  useResultSource({priority:40,scopeId,applications:{snapshot:onDeleteExcerpt ? false : undefined},enabled:Boolean(notes?.length),matches:[...resultEntities('excerpt',[notes?.[0]]),...resultEntities('annotation',(notes||[]).filter(n=>n.annotation&&(!annotationId||n.id===annotationId)&&matchesItem('annotation',n,search)))]});
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

  return <div className="reader-excerpt-annotations"><SearchStatus id={scopeId} label={translate("i18n.annotation")}/>
    {orderType(notes,'annotation',order).filter((note) => note.annotation&&(!annotationId||note.id===annotationId)&&matchesItem('annotation',note,search)).map((note) => (
      <div className="reader-annotation-card" key={note.id}>
        <Annotation inlineEdit note={note} onSaved={onChange} onDelete={() => mutate(() => removeExcerptAnnotation(note))} />
      </div>
    ))}
    {!adding && <ContentCommand kind="create" label={translate("i18n.newAnnotation")} disabled={saving} run={() => setAdding(true)} />}
    {adding && <ContentCommand kind="cancel-create" label={translate("i18n.cancelNewAnnotation")} run={() => { setAdding(false); setDraft(''); setError(''); }} />}
    {adding && <><textarea autoFocus rows="2" aria-label={translate("i18n.addAnnotation")} placeholder={translate("i18n.addAnAnnotation")} value={draft}
      onChange={(event) => setDraft(event.target.value)} />
    <button type="button" disabled={!draft.trim()} onClick={() => mutate(() => {
      addKnowledgeNote({ ...notes[0], annotation: draft.trim() });
      setDraft('');
      setAdding(false);
    })}>{translate("i18n.saveAnnotation")}</button><button type="button" onClick={() => setAdding(false)}>{translate("i18n.cancel")}</button></>}
    {onDeleteExcerpt && <div className="excerpt-edit-actions">
      <ExcerptTypeField note={notes[0]} saving={saving} onChange={onChange} onHide={onHide} onError={setError} />
      <button type="button" disabled={saving} onClick={onDeleteExcerpt}>{translate("i18n.deleteExcerpt")}</button>
    </div>}
    {error && <p role="alert">{translateError(error)}</p>}
  </div>;
}

export function ExcerptTypeField({ note, saving, onChange, onHide, onError }) {
  return (
    <label className="excerpt-type-setting">
      {translate("i18n.type")}
      <select aria-label={translate("i18n.excerptType")} disabled={saving} value={excerptAppearance(note).excerptType}
        onChange={event => {
          const excerptType = event.target.value;
          if (excerptType === 'hidden' &&
              !window.confirm(translate("i18n.hiddenMarkersDisappearFromTheTextYou"))) return;
          try {
            updateExcerptAppearance(note, { excerptType });
            onError('');
            onChange();
            if (excerptType === 'hidden') onHide?.();
          } catch (error) {
            onError(error.message);
          }
        }}>
        {Object.entries(excerptTypes).map(([type, label]) => <option key={type} value={type}>{translate(label)}</option>)}
      </select>
    </label>
  );
}

import useContentOrder from '../ui/useContentOrder.js';
import { orderType } from '../data/contentOrder.js';
import useMapSource, {mapEntities} from '../ui/useMapSource.js';
import { ContentCommand } from '../features/ContentCommands.jsx';
import {useSearchCount,useSearchScope,SearchStatus} from '../search/useSearchScope.jsx';
import {matchesItem,hasSearch} from '../search/searchCore.js';
import { useState } from 'react';
import Annotation from '../features/Annotation.jsx';
import { addKnowledgeNote, excerptAppearance, excerptTypes, removeExcerptAnnotation, updateExcerptAppearance } from '../data/knowledgeStore.js';

export default function ExcerptAnnotations({ notes, annotationId, onChange, onDeleteExcerpt, onHide, saving = false }) {
  const order = useContentOrder();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const scopeId=`annotations:${notes?.[0]?.id}`;
  const search=useSearchScope({id:scopeId,label:'当前摘录的批注',priority:40,enabled:Boolean(notes?.length)});
  useSearchCount(scopeId,(notes||[]).filter(note=>note.annotation&&(!annotationId||note.id===annotationId)&&matchesItem('annotation',note,search)).length);
  useMapSource({priority:40,snapshotEnabled:!onDeleteExcerpt,enabled:Boolean(notes?.length),entities:[...mapEntities('excerpt',[notes?.[0]]),...mapEntities('annotation',(notes||[]).filter(n=>n.annotation&&(!annotationId||n.id===annotationId)&&matchesItem('annotation',n,search)))]});
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
    {orderType(notes,'annotation',order).filter((note) => note.annotation&&(!annotationId||note.id===annotationId)&&matchesItem('annotation',note,search)).map((note) => (
      <div className="reader-annotation-card" key={note.id}>
        <Annotation inlineEdit note={note} onSaved={onChange} onDelete={() => mutate(() => removeExcerptAnnotation(note))} />
      </div>
    ))}
    {!adding && <ContentCommand kind="create" label="新建批注" disabled={saving} run={() => setAdding(true)} />}
    {adding && <ContentCommand kind="cancel-create" label="取消新增批注" run={() => { setAdding(false); setDraft(''); setError(''); }} />}
    {adding && <><textarea autoFocus rows="2" aria-label="新增批注" placeholder="新增批注…" value={draft}
      onChange={(event) => setDraft(event.target.value)} />
    <button type="button" disabled={!draft.trim()} onClick={() => mutate(() => {
      addKnowledgeNote({ ...notes[0], annotation: draft.trim() });
      setDraft('');
      setAdding(false);
    })}>保存批注</button><button type="button" onClick={() => setAdding(false)}>取消</button></>}
    <div className="excerpt-edit-actions">
      <label className="excerpt-type-setting">
        类型
        <select aria-label="摘录类型" disabled={saving} value={excerptAppearance(notes[0]).excerptType}
          onChange={event => {
            const excerptType = event.target.value;
            if (excerptType === 'hidden' &&
                !window.confirm('隐藏后，原文不再显示这条标记。你仍可在摘录汇总里查看批注或恢复显示。')) return;
            mutate(() => {
              updateExcerptAppearance(notes[0], { excerptType });
              if (excerptType === 'hidden') onHide?.();
            });
          }}>
          {Object.entries(excerptTypes).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
        </select>
      </label>
      {onDeleteExcerpt && <button type="button" disabled={saving} onClick={onDeleteExcerpt}>删除摘录</button>}
    </div>
    {error && <p role="alert">{error}</p>}
  </div>;
}

import { formatDate, translate, translateError } from '../../i18n/index.js';
import useContentOrder from '../../ui/useContentOrder.js';
import { orderType } from '../../data/contentOrder.js';
import EditSurface from '../../ui/EditSurface.jsx';
import { toggleEditor, editActivationProps } from '../../ui/editGesture.js';
import useResultSource, {resultEntities} from '../../results/useResultSource.js';
import { diarySearchRanges } from './diarySearch.js';
import { useNavigationState } from '../../ui/useNavigationState.js';
import DisplayViewMenu from '../../ui/DisplayViewMenu.jsx';
import { WorkspaceActions, WorkspaceFields } from '../ui.jsx';
import useEditSession from '../../ui/useEditSession.js';
import { ContentCommand } from '../ContentCommands.jsx';
import { useSearchCount, useSearchScope, SearchStatus, dateFilters } from '../../search/useSearchScope.jsx';
import { matchesItem } from '../../search/searchCore.js';
import ContentActions from '../ContentActions.jsx';
import { useEffect, useRef, useState } from 'react';
import { ActionWorkspace, FeaturePanel } from '../ui.jsx';
import { createId, loadSpaceData, readImageFile, saveContentData, saveSpaceData } from '../../data/spaceStorage.js';


const diaryDay = (value = new Date()) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const diaryPhotos = entry => entry.photos ?? [entry.photo].filter(Boolean);
const diaryPlacements = entry => entry.placements ?? diaryPhotos(entry).map((_, index) => ({ id: `legacy-${index}`, photoIndex: index, x: 8 + index % 3 * 28, y: 70 + Math.floor(index / 3) * 150 }));

function DiaryImages({ entry, onChange }) {
  return diaryPlacements(entry).map(item => <img key={item.id} className="diary-canvas-photo" src={diaryPhotos(entry)[item.photoIndex]} alt={translate("i18n.diaryPhoto")} draggable={Boolean(onChange)}
    style={{ left: `${item.x}%`, top: item.y }}
    onDragStart={event => { event.stopPropagation(); event.dataTransfer.setData('application/x-diary-photo', JSON.stringify({ id: item.id, photoIndex: item.photoIndex })); }}
    onDoubleClick={event => { if (onChange) event.stopPropagation(); if (onChange && window.confirm(translate("i18n.removeThisPhotoFromTheCanvas"))) onChange(diaryPlacements(entry).filter(photo => photo.id !== item.id)); }} />);
}

function DiaryCanvas({ entry, prefs, readOnly = false, query = '', onTextChange, onPhotosChange, ...events }) {
  const highlightRef = useRef(null);
  const inputRef = useRef(null);
  const text = entry.text ?? '';
  const ranges = diarySearchRanges(text, query);
  const highlighted = [];
  let cursor = 0;
  ranges.forEach(([start, end]) => {
    highlighted.push(text.slice(cursor, start), <mark key={start}>{text.slice(start, end)}</mark>);
    cursor = end;
  });
  highlighted.push(text.slice(cursor));
  const syncScroll = () => {
    if (!highlightRef.current || !inputRef.current) return;
    highlightRef.current.scrollTop = inputRef.current.scrollTop;
    highlightRef.current.scrollLeft = inputRef.current.scrollLeft;
  };
  useEffect(syncScroll, [query, text]);
  const format = entry.format ?? prefs;
  return <article className={`diary-paper diary-today ${format.pen === '羽毛笔' ? 'diary-quill' : ''}`} {...events}>
    <header><time dateTime={diaryDay(entry.date ?? new Date())}>{formatDate(entry.date ?? Date.now(), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</time>{entry.mood?.trim() && <span>{entry.mood}</span>}</header>
    <div className={`diary-text-layer ${ranges.length ? 'has-search-matches' : ''}`} style={{ fontSize: `${format.fontSize ?? 18}px`, lineHeight: format.lineHeight ?? 2 }}>
      <div ref={highlightRef} className="diary-search-highlight" aria-hidden="true">{highlighted}{'\n'}</div>
      <textarea ref={inputRef} readOnly={readOnly} className="diary-today-text" value={text} aria-label={translate("i18n.diaryText")} onChange={onTextChange} onScroll={syncScroll} />
    </div>
    <DiaryImages entry={entry} onChange={onPhotosChange} />
  </article>;
}

export default function DiaryPanel({ onClose, navigationItem, editItem }) {
  const [entries, setEntries] = useState(() => loadSpaceData('diary', []));
  const [draft, setDraft] = useState(() => {
    if (editItem) return { ...entries.find(entry => entry.id === editItem.id) };
    const cached = loadSpaceData('diary-draft', null);
    return cached?.day === diaryDay() ? cached.draft : entries.find(entry => diaryDay(entry.date) === diaryDay()) ?? { mood: '', text: '', photo: '' };
  });
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const editFromBook = useRef(false);

  const [mode, setMode] = useNavigationState('diary','mode',navigationItem?.type === 'diary' ? 'read' : 'write', { preferInitial:navigationItem?.type === 'diary' });
  const search=useSearchScope({id:'diary',label:translate("i18n.diary"),priority:10,filters:mode === 'write' ? [] : [...dateFilters,{key:'mood',label:translate("i18n.mood"),options:[...new Set(entries.map(e=>e.mood).filter(Boolean))].map(v=>[v,v])}],onApply:()=>{}});
  const [opened, setOpened] = useNavigationState('diary','opened',() => navigationItem?.type === 'diary' ? navigationItem.id : null, { preferInitial:navigationItem?.type === 'diary' });
  const [editing, setEditing] = useState(() => editItem?.id ?? entries.find(entry => diaryDay(entry.date) === diaryDay())?.id ?? null);
  useEffect(() => {
    if (editItem) return;
    if (!editing || entries.find(entry => entry.id === editing)?.date && diaryDay(entries.find(entry => entry.id === editing).date) === diaryDay()) {
      if (!saveSpaceData('diary-draft', { day: diaryDay(), draft })) setError(translate("i18n.couldNotSaveTheDraftLocalStorage"));
    }
  }, [draft, editing]);
  useEditSession(editorOpen, () => setEditorOpen(false));
  const editingDiaryPage = mode === 'write' && editFromBook.current;
  useEditSession(editingDiaryPage, () => { if (!editorOpen) readDiary(); }, { editing: false });
  const [prefs, setPrefs] = useState(() => ({...loadSpaceData('diary-prefs', { pen: '钢笔', sound: false, animation: true }), ...editItem?.format}));
  const soundRef = useRef(null);

  useEffect(() => () => { soundRef.current?.close(); }, []);

  const setPreference = (key, value) => {
    const next = { ...prefs, [key]: value };
    setDraft(current => ({ ...current, format: { ...(current.format ?? prefs), [key]: value } }));
    saveSpaceData('diary-prefs', next);
    setPrefs(next);
  };

  const scratch = () => {
    if (!prefs.sound || !window.AudioContext) return;
    const context = soundRef.current ??= new AudioContext();
    if (context.state === 'suspended') context.resume().catch(() => {});
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * .075), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) {
      samples[index] = (Math.random() * 2 - 1) * Math.sin(Math.PI * index / samples.length);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = prefs.pen === '钢笔' ? 2100 : 1350;
    const volume = context.createGain();
    volume.gain.value = .085;
    source.connect(filter).connect(volume).connect(context.destination);
    source.start();
  };

  const persist = (next) => {
    if (!saveContentData('diary', next)) {
      setError(translate("i18n.couldNotSaveLocalStorageMayBe"));
      return false;
    }
    setError('');
    setEntries(next);
    return true;
  };

  const filtered = orderType(entries.filter(entry=>matchesItem('diary',entry,search)), 'diary', useContentOrder());

  const pageIndex = opened ? filtered.findIndex(entry => entry.id === opened) : 0;
  const currentIndex = pageIndex < 0 ? 0 : pageIndex;
  const currentPage = filtered[currentIndex];
  useResultSource({ scopeId: 'diary', priority:10,detail:true,label:translate("i18n.diary"),applications:{snapshot:resultEntities('diary',mode==='read'?[currentPage]:[{...draft,id:editing || draft.id}])},matches:resultEntities('diary',mode==='read'?filtered:[entries.find(e=>e.id===editing) || entries.find(e=>diaryDay(e.date)===diaryDay(draft.date ?? new Date()))])});
  const [turnDirection, setTurnDirection] = useState('next');
  const turnPage = direction => {
    const next = filtered[currentIndex + direction];
    if (!next) return;
    setTurnDirection(direction > 0 ? 'next' : 'previous');
    setOpened(next.id);
  };
  const editPage = entry => {
    editFromBook.current = true;
    setDraft({ ...entry });
    if (entry.format) setPrefs(current => ({ ...current, ...entry.format }));
    setEditing(entry.id);
    setOpened(entry.id);
    setEditorOpen(false);
    setMode('write');
  };
  useEffect(() => {
    if (mode !== 'read') return;
    const navigate = event => {
      if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || document.querySelector('dialog[open]')) return;
      if (event.target.closest?.('input, select, textarea:not([readonly]), [contenteditable="true"]')) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) turnPage(event.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', navigate, true);
    return () => window.removeEventListener('keydown', navigate, true);
  }, [mode, currentIndex, filtered]);

  useSearchCount('diary', mode === 'write' ? diarySearchRanges(draft.text ?? '', search.query).length : filtered.length);
  const addEntry = () => {
    if (!draft.text.trim() && !diaryPhotos(draft).length && !editing) return;
    const existing = entries.find(entry => entry.id === editing) ?? entries.find(entry => diaryDay(entry.date) === diaryDay());
    const saved = { ...existing, ...draft, format: draft.format ?? prefs, id: existing?.id ?? createId('diary'), date: existing?.date ?? new Date().toISOString() };
    const next = existing ? entries.map(entry => entry.id === existing.id ? saved : entry) : [saved, ...entries];
    if (!persist(next)) return false;
    setEditing(saved.id);
    setOpened(saved.id);
    setEditorOpen(false);
    return true;
  };

  const readDiary = () => {
    if (mode === 'read') return;
    if (!draft.text.trim() && !diaryPhotos(draft).length && !editing) setMode('read');
    else if (addEntry()) { setEditorOpen(false); setMode('read'); }
  };
  const writeToday = () => {
    editFromBook.current = false;
    if (mode === 'write' && (editing || draft.text.trim() || diaryPhotos(draft).length) && addEntry() === false) return;
    setEditorOpen(false);
    const today = entries.find(entry => diaryDay(entry.date) === diaryDay());
    const cached = loadSpaceData('diary-draft', null);
    setDraft(cached?.day === diaryDay() ? cached.draft : today ?? { mood: '', text: '', photo: '' });
    setEditing(today?.id ?? null);
    setMode('write');
  };

  const showDiaryRelations = (event, entry, writing = false) => {
    event.preventDefault();
    event.stopPropagation();
    let saved = entry;
    if (writing) {
      const existing = entries.find(item => item.id === editing) ?? entries.find(item => diaryDay(item.date) === diaryDay(entry.date ?? new Date()));
      saved = { ...existing, ...entry, id: existing?.id ?? createId('diary'), date: existing?.date ?? entry.date ?? new Date().toISOString(), format: entry.format ?? prefs };
      if (!persist(existing ? entries.map(item => item.id === existing.id ? saved : item) : [saved, ...entries])) return;
      setEditing(saved.id);
      setDraft(saved);
    }
    const element = event.currentTarget;
    window.dispatchEvent(new CustomEvent('cyber-show-relations', { detail: { source: {
      key: `diary:${saved.id}`, type: 'diary', id: saved.id,
      title: translate("i18n.diary0", formatDate(saved.date)), element
    } } }));
  };
  const closeDiary = () => {
    if (mode === 'write' && (editing || draft.text.trim() || diaryPhotos(draft).length) && addEntry() === false) return;
    onClose();
  };
  const backDiary = () => {
    if (editorOpen) { setEditorOpen(false); return; }
    if (mode === 'write' && editFromBook.current) { readDiary(); return; }
    closeDiary();
  };
  const fields = (<div className="stack-form">
        <WorkspaceFields>
          {editItem && <label>{translate("i18n.fullText")}<textarea value={draft.text} onChange={event => setDraft(current => ({...current, text:event.target.value}))} /></label>}
          <label>{translate("i18n.writingTool")}{' '}<select value={prefs.pen} onChange={(event) => setPreference('pen', event.target.value)}><option value="钢笔">{translate("i18n.fountainPen")}</option><option value="羽毛笔">{translate("i18n.quill")}</option></select></label>
          <label>{translate("i18n.writingSounds")}<input type="checkbox" checked={prefs.sound} onChange={(event) => setPreference('sound', event.target.checked)} /></label>
          <label>{translate("i18n.handwritingAnimation")}<input type="checkbox" checked={prefs.animation} onChange={(event) => setPreference('animation', event.target.checked)} /></label>
          <label>{translate("i18n.textSize")}<select value={prefs.fontSize ?? 18} onChange={event => setPreference('fontSize', Number(event.target.value))}>{[14, 16, 18, 20, 24, 28, 32].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
          <label>{translate("i18n.lineSpacing2")}<select value={prefs.lineHeight ?? 2} onChange={event => setPreference('lineHeight', Number(event.target.value))}>{[1.4, 1.6, 1.8, 2, 2.4, 2.8].map(height => <option key={height} value={height}>{height}</option>)}</select></label>
          <label>{translate("i18n.status")}<input value={draft.mood ?? ''} onChange={event => setDraft(current => ({ ...current, mood: event.target.value }))} /></label>
          <label className="diary-photo-upload"><span>{translate("i18n.addImage")}</span><input type="file" multiple accept="image/*" onChange={async event => {
            const files = Array.from(event.target.files || []); event.target.value = '';
            try {
              const added = await Promise.all(files.map(file => readImageFile(file)));
              setDraft(current => ({ ...current, placements: diaryPlacements(current), photos: [...diaryPhotos(current), ...added] }));
              setError('');
            } catch (failure) { setError(failure.message); }
          }} /></label>
          <div className="diary-photo-library">{diaryPhotos(draft).map((photo, index) => <img key={index} src={photo} alt={translate("i18n.image0", index + 1)} draggable
            onDragStart={event => event.dataTransfer.setData('application/x-diary-photo', JSON.stringify({ photoIndex: index }))}
            onDoubleClick={() => { if (window.confirm(translate("i18n.removeThisPhotoFromTheImageLibrary"))) setDraft(current => ({ ...current, photo: '', photos: diaryPhotos(current).filter((_, i) => i !== index), placements: diaryPlacements(current).filter(item => item.photoIndex !== index).map(item => ({ ...item, photoIndex: item.photoIndex > index ? item.photoIndex - 1 : item.photoIndex })) })); }} />)}</div>
          {editItem && error && <p role="alert">{translateError(error)}</p>}
        </WorkspaceFields>
        <WorkspaceActions>
          <button type="button" onClick={() => { if (addEntry() && editItem) onClose(); }}>{editing ? translate("i18n.save") : translate("i18n.saveTodaySEntry")}</button>
          {editing && <button type="button" onClick={() => {
            if (window.confirm(translate("i18n.deleteThisDiaryEntry")) && persist(entries.filter(item => item.id !== editing)) !== false) { setEditing(null); setMode('read'); if (editItem) onClose(); }
          }}>{translate("i18n.delete")}</button>}
        </WorkspaceActions>
      </div>);
  if (editItem) return <ActionWorkspace command={false} showTrigger={false} kind="edit" title={translate("i18n.editDiaryEntry")} open onOpenChange={open => { if (!open) onClose(); }}>{fields}</ActionWorkspace>;
  return (
    <FeaturePanel scopeId="diary" hasMenu title="i18n.journal" scrollContext={mode} kicker="Private Diary"  onClose={closeDiary} onBack={backDiary}>
      {mode === 'write' && <ContentCommand kind="cancel-create" label={translate("i18n.switchToReadingMode")} run={readDiary} />}
      <ContentCommand kind="create" label={translate("i18n.writeTodaySEntry")} run={writeToday} />
      <DisplayViewMenu label={translate("i18n.diaryView")} options={[[ 'write', translate("i18n.todaySEntry")], ['read', translate("i18n.readingMode")]]} value={mode} onChange={value => value === 'write' ? writeToday() : readDiary()} />
      {error && <p role="alert" className="form-error">{translateError(error)}</p>}
      {mode === 'write' && <DiaryCanvas entry={draft} prefs={prefs} query={search.query} data-edit-active={editingDiaryPage || undefined} data-relation-gesture onContextMenu={event => showDiaryRelations(event, draft, true)} {...editActivationProps(() => toggleEditor(setEditorOpen))}
        onDragOver={event => { if (event.dataTransfer.types.includes('application/x-diary-photo')) event.preventDefault(); }}
        onDrop={event => {
          const raw = event.dataTransfer.getData('application/x-diary-photo');
          if (!raw) return;
          event.preventDefault();
          let item; try { item = JSON.parse(raw); } catch { return; }
          if (!Number.isInteger(item.photoIndex) || !diaryPhotos(draft)[item.photoIndex]) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const placed = { id: item.id ?? createId('photo'), photoIndex: item.photoIndex, x: Math.max(0, Math.min(72, (event.clientX - rect.left) / rect.width * 100 - 12)), y: Math.max(40, Math.min(rect.height - 150, event.clientY - rect.top - 40)) };
          setDraft(current => ({ ...current, placements: [...diaryPlacements(current).filter(photo => photo.id !== placed.id), placed] }));
        }}
        onTextChange={event => {
          scratch();
          if (prefs.animation && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            event.currentTarget.getAnimations().forEach(animation => animation.cancel());
            event.currentTarget.animate([{ color: '#765f4c' }, { color: '#3d2a21' }], 180);
          }
          setDraft(current => ({ ...current, text: event.target.value }));
        }}
        onPhotosChange={placements => setDraft(current => ({ ...current, placements }))} />}
      {editorOpen && <EditSurface inline>{fields}</EditSurface>}
      {mode === 'read' && <section className="diary-book" aria-label={translate("i18n.readDiary")}>
        <SearchStatus id="diary" label={translate("i18n.diary")} />
        {currentPage ? <>
          <div className="diary-book-cover">
            <div key={currentPage.id} className="diary-book-page" data-turn={turnDirection} data-content-target={navigationItem?.catalogCommand ? `diary:${currentPage.id}` : undefined}>
              {navigationItem?.catalogCommand && <ContentCommand label={translate("i18n.editDiaryEntry")} run={() => editPage(currentPage)} />}
              <DiaryCanvas entry={currentPage} prefs={prefs} readOnly data-relation-gesture onContextMenu={event => showDiaryRelations(event, currentPage)} {...editActivationProps(() => editPage(currentPage))} />
            </div>
          </div>
          <nav className="diary-book-pagination" aria-label={translate("i18n.diaryPageNavigation")}>
            <button type="button" aria-label={translate("i18n.previousPage2")} disabled={currentIndex === 0} onClick={() => turnPage(-1)}>‹</button>
            <span aria-live="polite" aria-atomic="true">{currentIndex + 1} / {filtered.length}</span>
            <button type="button" aria-label={translate("i18n.nextPage2")} disabled={currentIndex === filtered.length - 1} onClick={() => turnPage(1)}>›</button>
          </nav>
        </> : <div className="diary-book-cover diary-book-empty"><></></div>}
      </section>}

    </FeaturePanel>
  );
}

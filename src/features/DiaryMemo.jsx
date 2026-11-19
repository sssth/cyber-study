import useContentOrder from '../ui/useContentOrder.js';
import { orderType } from '../data/contentOrder.js';
import EditSurface from '../ui/EditSurface.jsx';
import { toggleEditor, editActivationProps } from '../ui/editGesture.js';
import useMapSource, {mapEntities} from '../ui/useMapSource.js';
import { diarySearchRanges } from './diarySearch.js';
import { useNavigationState } from '../ui/useNavigationState.js';
import DisplayViewMenu from '../ui/DisplayViewMenu.jsx';
import { WorkspaceActions } from './ui.jsx';
import useEditSession from '../ui/useEditSession.js';
import { ContentCommand } from './ContentCommands.jsx';
import {useSearchCount,useSearchScope,SearchStatus,dateFilters} from '../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../search/searchCore.js';
import ContentActions from './ContentActions.jsx';
import { matchesShortcut } from '../data/shortcuts.js';
import { useMemo, useEffect, useRef, useState } from 'react';
import { memoPosition, mergeMemoChanges, memoSize, clickedTodo } from './memoLayout.js';
import { ActionWorkspace, FeaturePanel } from './ui.jsx';
import { createId, loadSpaceData, readImageFile, saveSpaceData } from '../data/spaceStorage.js';

const diaryDay = (value = new Date()) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const diaryPhotos = entry => entry.photos ?? [entry.photo].filter(Boolean);
const diaryPlacements = entry => entry.placements ?? diaryPhotos(entry).map((_, index) => ({ id: `legacy-${index}`, photoIndex: index, x: 8 + index % 3 * 28, y: 70 + Math.floor(index / 3) * 150 }));

function DiaryImages({ entry, onChange }) {
  return diaryPlacements(entry).map(item => <img key={item.id} className="diary-canvas-photo" src={diaryPhotos(entry)[item.photoIndex]} alt="日记照片" draggable={Boolean(onChange)}
    style={{ left: `${item.x}%`, top: item.y }}
    onDragStart={event => { event.stopPropagation(); event.dataTransfer.setData('application/x-diary-photo', JSON.stringify({ id: item.id, photoIndex: item.photoIndex })); }}
    onDoubleClick={event => { if (onChange) event.stopPropagation(); if (onChange && window.confirm('删除画布上的这张照片？')) onChange(diaryPlacements(entry).filter(photo => photo.id !== item.id)); }} />);
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
    <header><time dateTime={diaryDay(entry.date ?? new Date())}>{new Date(entry.date ?? Date.now()).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</time>{entry.mood?.trim() && <span>{entry.mood}</span>}</header>
    <div className={`diary-text-layer ${ranges.length ? 'has-search-matches' : ''}`} style={{ fontSize: `${format.fontSize ?? 18}px`, lineHeight: format.lineHeight ?? 2 }}>
      <div ref={highlightRef} className="diary-search-highlight" aria-hidden="true">{highlighted}{'\n'}</div>
      <textarea ref={inputRef} readOnly={readOnly} className="diary-today-text" value={text} aria-label="日记正文" onChange={onTextChange} onScroll={syncScroll} />
    </div>
    <DiaryImages entry={entry} onChange={onPhotosChange} />
  </article>;
}

function DiaryPanel({ onClose, navigationItem, editItem }) {
  const [entries, setEntries] = useState(() => loadSpaceData('diary', []));
  const [draft, setDraft] = useState(() => {
    if (editItem) return { ...entries.find(entry => entry.id === editItem.id) };
    const cached = loadSpaceData('diary-draft', null);
    return cached?.day === diaryDay() ? cached.draft : entries.find(entry => diaryDay(entry.date) === diaryDay()) ?? { mood: '', text: '', photo: '' };
  });
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const editFromBook = useRef(false);

  const [mode, setMode] = useNavigationState('diary','mode',navigationItem?.type === 'diary' ? 'read' : 'write');
  const search=useSearchScope({id:'diary',label:'日记',priority:10,filters:mode === 'write' ? [] : [...dateFilters,{key:'mood',label:'心情',options:[...new Set(entries.map(e=>e.mood).filter(Boolean))].map(v=>[v,v])}],onApply:()=>{}});
  const [opened, setOpened] = useNavigationState('diary','opened',() => navigationItem?.type === 'diary' ? navigationItem.id : null);
  const [editing, setEditing] = useState(() => editItem?.id ?? entries.find(entry => diaryDay(entry.date) === diaryDay())?.id ?? null);
  useEffect(() => {
    if (editItem) return;
    if (!editing || entries.find(entry => entry.id === editing)?.date && diaryDay(entries.find(entry => entry.id === editing).date) === diaryDay()) {
      if (!saveSpaceData('diary-draft', { day: diaryDay(), draft })) setError('草稿保存失败，本地存储可能已满。');
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
    if (!saveSpaceData('diary', next)) {
      setError('保存失败，本地存储可能已满。');
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
  useMapSource({priority:10,detail:true,label:'日记',snapshotEntities:mapEntities('diary',mode==='read'?[currentPage]:[{...draft,id:editing || draft.id}]),entities:mapEntities('diary',mode==='read'?filtered:[entries.find(e=>e.id===editing) || entries.find(e=>diaryDay(e.date)===diaryDay(draft.date ?? new Date()))])});
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
      title: `${new Date(saved.date).toLocaleDateString('zh-CN')} 日记`, element
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
        {editItem && <label>正文<textarea value={draft.text} onChange={event => setDraft(current => ({...current, text:event.target.value}))} /></label>}
        <label>书写工具 <select value={prefs.pen} onChange={(event) => setPreference('pen', event.target.value)}><option>钢笔</option><option>羽毛笔</option></select></label>
        <label>书写音效<input type="checkbox" checked={prefs.sound} onChange={(event) => setPreference('sound', event.target.checked)} /></label>
        <label>字迹动画<input type="checkbox" checked={prefs.animation} onChange={(event) => setPreference('animation', event.target.checked)} /></label>
        <label>字号<select value={prefs.fontSize ?? 18} onChange={event => setPreference('fontSize', Number(event.target.value))}>{[14, 16, 18, 20, 24, 28, 32].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        <label>行间距<select value={prefs.lineHeight ?? 2} onChange={event => setPreference('lineHeight', Number(event.target.value))}>{[1.4, 1.6, 1.8, 2, 2.4, 2.8].map(height => <option key={height} value={height}>{height}</option>)}</select></label>
        <label>状态<input value={draft.mood ?? ''} onChange={event => setDraft(current => ({ ...current, mood: event.target.value }))} /></label>
        <label className="diary-photo-upload"><span>添加图片</span><input type="file" multiple accept="image/*" onChange={async event => {
          const files = Array.from(event.target.files || []); event.target.value = '';
          try {
            const added = await Promise.all(files.map(file => readImageFile(file)));
            setDraft(current => ({ ...current, placements: diaryPlacements(current), photos: [...diaryPhotos(current), ...added] }));
            setError('');
          } catch (failure) { setError(failure.message); }
        }} /></label>
        <div className="diary-photo-library">{diaryPhotos(draft).map((photo, index) => <img key={index} src={photo} alt={`图片 ${index + 1}`} draggable
          onDragStart={event => event.dataTransfer.setData('application/x-diary-photo', JSON.stringify({ photoIndex: index }))}
          onDoubleClick={() => { if (window.confirm('从图片库和日记画布删除这张照片？')) setDraft(current => ({ ...current, photo: '', photos: diaryPhotos(current).filter((_, i) => i !== index), placements: diaryPlacements(current).filter(item => item.photoIndex !== index).map(item => ({ ...item, photoIndex: item.photoIndex > index ? item.photoIndex - 1 : item.photoIndex })) })); }} />)}</div>
        <WorkspaceActions>
          <button type="button" onClick={() => { if (addEntry() && editItem) onClose(); }}>{editing ? '保存' : '保存今日'}</button>
          {editing && <button type="button" onClick={() => {
            if (window.confirm('确认删除这篇日记？') && persist(entries.filter(item => item.id !== editing)) !== false) { setEditing(null); setMode('read'); if (editItem) onClose(); }
          }}>删除</button>}
        </WorkspaceActions>
      </div>);
  if (editItem) return <ActionWorkspace command={false} showTrigger={false} title="编辑日记" open onOpenChange={open => { if (!open) onClose(); }}>{fields}{error && <p role="alert">{error}</p>}</ActionWorkspace>;
  return (
    <FeaturePanel hasMenu title="日记本" kicker="Private Diary"  onClose={closeDiary} onBack={backDiary}>
      {mode === 'write' && <ContentCommand kind="cancel-create" label="切换阅读模式" run={readDiary} />}
      <ContentCommand kind="create" label="书写今日日记" run={writeToday} />
      <DisplayViewMenu label="日记模式" options={[[ 'write', '今日日记'], ['read', '阅读模式']]} value={mode} onChange={value => value === 'write' ? writeToday() : readDiary()} />
      {error && <p role="alert" className="form-error">{error}</p>}
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
      {mode === 'read' && <section className="diary-book" aria-label="日记本阅读">
        <SearchStatus id="diary" label="日记" />
        {currentPage ? <>
          <div className="diary-book-cover">
            <div key={currentPage.id} className="diary-book-page" data-turn={turnDirection} data-content-target={navigationItem?.catalogCommand ? `diary:${currentPage.id}` : undefined}>
              {navigationItem?.catalogCommand && <ContentCommand label="编辑日记" run={() => editPage(currentPage)} />}
              <DiaryCanvas entry={currentPage} prefs={prefs} readOnly data-relation-gesture onContextMenu={event => showDiaryRelations(event, currentPage)} {...editActivationProps(() => editPage(currentPage))} />
            </div>
          </div>
          <nav className="diary-book-pagination" aria-label="日记翻页">
            <button type="button" aria-label="上一页" disabled={currentIndex === 0} onClick={() => turnPage(-1)}>‹</button>
            <span aria-live="polite" aria-atomic="true">{currentIndex + 1} / {filtered.length}</span>
            <button type="button" aria-label="下一页" disabled={currentIndex === filtered.length - 1} onClick={() => turnPage(1)}>›</button>
          </nav>
        </> : <div className="diary-book-cover diary-book-empty"><></></div>}
      </section>}

    </FeaturePanel>
  );
}

function MemoBoard({ onClose, shortcuts, editItem }) {
  const [view, setView] = useNavigationState('memo','view','board');
  const [showOnBoard, setShowOnBoard] = useState(true);
  const [stickyMode, setStickyMode] = useState('text');
  const order = useContentOrder();
  const [items, setItems] = useState(() => loadSpaceData('memo', []));
  const [editingMemo, setMemo] = useState(() => editItem ? items.find(item => item.id === editItem.id) : null);
  const setEditingMemo = value => { setMemo(value); if (!value && editItem) onClose(); };
  const search=useSearchScope({id:'memo',label:'便签与待办',priority:10,filters:[{key:'type',label:'类型',options:[['memo','便签'],['todo','待办']]},{key:'status',label:'待办状态',options:[['open','未完成'],['done','已完成']]}]});

  useEffect(()=>{const refresh=()=>setItems(loadSpaceData('memo',[]));window.addEventListener('cyber-content-changed',refresh);return ()=>window.removeEventListener('cyber-content-changed',refresh);},[]);
  const visibleItems = useMemo(() => editItem ? [] : items.filter(item =>
    (view === 'board' ? item.showOnBoard !== false : view === 'todo' ? item.type === 'todo' : item.type !== 'todo')
    && matchesItem(item.type === 'todo' ? 'todo' : 'memo', item, search)
  ), [items, view, search, editItem]);
  useMapSource({priority:10,enabled:!editItem,entities:visibleItems.flatMap(item=>mapEntities(item.type==='todo'?'todo':'memo',[item]))});
  useSearchCount('memo',visibleItems.length);
  const [boardMemoType, setMemoType] = useState('todo');
  const memoType = view === 'board' ? boardMemoType : view === 'todo' ? 'todo' : 'sticky';
  const [adding, setAdding] = useState(false);
  const imageInputRef = useRef(null);
  const [todoText, setTodoText] = useState('');
  const [stickyText, setStickyText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [error, setError] = useState('');
  const [tone, setTone] = useState('violet');
  const draggingRef = useRef(null);
  const boardRef = useRef(null);

  const persist = (next, baseline = items) => {
    next = mergeMemoChanges(loadSpaceData('memo', []), baseline, next);
    if (!saveSpaceData('memo', next)) { setError('保存失败，本地存储可能已满。'); return false; }
    setItems(next);
    setError('');
    return true;
  };

  const addItem = (item) => {
    const board = boardRef.current;
    const latest = loadSpaceData('memo', []);
    const position = memoPosition(latest.filter(entry => entry.showOnBoard !== false), item.photo ? 'image' : item.type, board?.clientWidth || 600, board?.clientHeight || 420, memoSize(item));
    return persist([...latest, { id: createId(item.type), createdAt: new Date().toISOString(), ...position, showOnBoard, ...item }]);
  };

  const layers = editItem || view !== 'board' ? [] : [...items].sort((a, b) => (a.raisedAt || a.createdAt || '').localeCompare(b.raisedAt || b.createdAt || ''));
  const activateMemo = item => {
    if (item.type === 'todo') persist(items.map(entry => entry.id === item.id ? clickedTodo(entry, view) : entry));
  };

  const addTodo = () => {
    if (!todoText.trim()) return;
    if (addItem({ type: 'todo', text: todoText.trim(), done: false, tone })) setTodoText('');
  };

  const addSticky = () => {
    if (!stickyText.trim()) return;
    if (addItem({ type: 'sticky', text: stickyText.trim(), tone })) setStickyText('');
  };

  const addImage = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const photo = await readImageFile(imageFile);
      if (addItem({ type: 'sticky', photo, text: '', tone })) { setImageFile(null); if (imageInputRef.current) imageInputRef.current.value = ''; }
    } catch (error) { setError(error.message); }
    finally { setAdding(false); }
  };

  const onPointerDown = (event, item, resize = false) => {
    if (event.button !== 0) return;
    const element = event.currentTarget.closest('.memo-item');
    draggingRef.current = {
      item, baseline: items, next: null, resize, startX: event.clientX, startY: event.clientY,
      x: element.offsetLeft, y: element.offsetTop, width: element.offsetWidth, height: element.offsetHeight
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    const drag = draggingRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const board = boardRef.current;
    const next = drag.resize ? {
      width: Math.max(100, Math.min(board.clientWidth - drag.x, drag.width + dx)),
      height: Math.max(48, Math.min(board.clientHeight - drag.y, drag.height + dy))
    } : {
      x: Math.max(0, Math.min(board.clientWidth - drag.width, drag.x + dx)),
      y: Math.max(0, Math.min(board.clientHeight - drag.height, drag.y + dy))
    };
    drag.next = { ...drag.item, ...next };
    setItems((list) => list.map((item) => item.id === drag.item.id ? { ...item, ...next } : item));
  };

  const finishDrag = () => {
    if (!draggingRef.current) return;
    const drag = draggingRef.current;
    draggingRef.current = null;
    if (!persist(drag.baseline.map(item => item.id === drag.item.id ? (drag.next || item) : item), drag.baseline)) setItems(loadSpaceData('memo', []));
  };

  const editor = (<ActionWorkspace command={false} showTrigger={false} label="编辑便签或待办" title="编辑内容" open={Boolean(editingMemo)} onOpenChange={value => { if (!value) setEditingMemo(null); }}>
        {editingMemo && <form className="stack-form" onSubmit={event => {
          event.preventDefault();
          if (editingMemo.imageMode && !editingMemo.photo) { setError('请选择一张图片。'); return; }
          if (persist(items.map(item => item.id === editingMemo.id ? { ...editingMemo, type: editingMemo.type === 'image' ? 'sticky' : editingMemo.type } : item)) !== false) setEditingMemo(null);
        }}>
          <label><input type="checkbox" checked={editingMemo.showOnBoard !== false} onChange={event => setEditingMemo({ ...editingMemo, showOnBoard: event.target.checked, raisedAt: event.target.checked ? new Date().toISOString() : editingMemo.raisedAt })} />在板上展示</label>
          {editingMemo.type !== 'todo' && <label>便签内容<select value={editingMemo.photo || editingMemo.imageMode ? 'image' : 'text'} onChange={event => setEditingMemo({ ...editingMemo, type: 'sticky', photo: event.target.value === 'text' ? '' : editingMemo.photo, imageMode: event.target.value === 'image' })}><option value="text">文字</option><option value="image">图片（仅一张）</option></select></label>}
          {!editingMemo.photo && !editingMemo.imageMode && <label>内容<textarea value={editingMemo.text || ''} onChange={event => setEditingMemo({ ...editingMemo, text: event.target.value })} /></label>}
          <label>颜色<select value={editingMemo.tone || 'violet'} onChange={event => setEditingMemo({ ...editingMemo, tone: event.target.value })}><option value="violet">紫色</option><option value="cyan">青色</option><option value="amber">琥珀色</option></select></label>
          {editingMemo.type === 'todo' && <label><input type="checkbox" checked={Boolean(editingMemo.done)} onChange={event => setEditingMemo({ ...editingMemo, done: event.target.checked, completedAt: event.target.checked ? new Date().toISOString() : null })} />已完成</label>}
          {editingMemo.type !== 'todo' && (editingMemo.photo || editingMemo.imageMode) && <>{editingMemo.photo && <img className="preview-image" src={editingMemo.photo} alt="图片便签" />}<label>更换图片<input type="file" accept="image/*" onChange={async event => {
            const file = event.target.files?.[0]; if (!file) return;
            try { const photo = await readImageFile(file); setEditingMemo(current => current ? { ...current, type: 'sticky', photo, text: '', imageMode: false } : current); } catch (failure) { setError(failure.message); }
          }} /></label></>}
          {error && <p role="alert" className="form-error">{error}</p>}
          <WorkspaceActions><button>保存</button>
          <button type="button" onClick={() => { if (window.confirm('确认删除这项内容？') && persist(items.filter(item => item.id !== editingMemo.id)) !== false) setEditingMemo(null); }}>删除</button></WorkspaceActions>
        </form>}
      </ActionWorkspace>);
  if (editItem) return editor;
  return (
    <FeaturePanel hasMenu wide title="Memo 板" kicker="Wall & Tasks" description="To-do、便签与图片固定在同一块板上，可拖拽排列，全部本地保存。" onClose={onClose}>
      <nav className="globe-mode-switch" aria-label="Memo 视图">
        <button aria-pressed={view === 'board'} onClick={() => setView('board')}>Memo 板</button>
        <button aria-pressed={view === 'memo'} onClick={() => setView('memo')}>便签</button>
        <button aria-pressed={view === 'todo'} onClick={() => setView('todo')}>待办</button>
      </nav>
      <ActionWorkspace label={view === 'board' ? '新建 Memo' : view === 'todo' ? '新建待办' : '新建便签'} title={view === 'board' ? '新建 Memo' : view === 'todo' ? '新建待办' : '新建便签'}><div className="stack-form memo-create-form">
        {view === 'board' && <label>类型<select value={memoType} disabled={adding} onChange={event => { setMemoType(event.target.value); setError(''); }}>
          <option value="todo">To Do</option><option value="sticky">便签</option>
        </select></label>}
        {memoType === 'sticky' && <label>便签内容<select value={stickyMode} disabled={adding} onChange={event => setStickyMode(event.target.value)}><option value="text">文字</option><option value="image">图片（仅一张）</option></select></label>}
        {memoType === 'sticky' && stickyMode === 'image' ? <label className="file-label memo-image-picker">
          <span>{imageFile?.name || '选择图片'}</span>
          <input ref={imageInputRef} aria-label="选择图片" type="file" accept="image/*" disabled={adding} onChange={event => setImageFile(event.target.files?.[0] || null)} />
        </label> : <label>文字<textarea rows="4" value={memoType === 'todo' ? todoText : stickyText}
          placeholder={memoType === 'todo' ? '输入待办事项' : '输入便签内容'}
          onChange={event => memoType === 'todo' ? setTodoText(event.target.value) : setStickyText(event.target.value)}
          onKeyDown={event => {
            if (memoType !== 'todo' || event.nativeEvent.isComposing || !matchesShortcut(event, shortcuts.addTodo)) return;
            event.preventDefault();
            if (!event.repeat) addTodo();
          }} /></label>}
        <label><input type="checkbox" checked={showOnBoard} onChange={event => setShowOnBoard(event.target.checked)} />在板上展示</label>
        <label>颜色<select value={tone} disabled={adding} onChange={event => setTone(event.target.value)}><option value="violet">紫色</option><option value="cyan">青色</option><option value="amber">琥珀色</option></select></label>
        {error && <p role="alert" className="form-error">{error}</p>}
        <WorkspaceActions><button type="button" onClick={memoType === 'todo' ? addTodo : stickyMode === 'image' ? addImage : addSticky}
          disabled={adding || (memoType === 'sticky' && stickyMode === 'image' ? !imageFile : !(memoType === 'todo' ? todoText : stickyText).trim())}>{adding ? '添加中…' : '添加'}</button></WorkspaceActions>
      </div></ActionWorkspace>
      {error && <p className="form-error">{error}</p>}
      <SearchStatus id="memo" label="便签与待办"/>
      {items.length>0&&!items.some(item=>matchesItem(item.type==='todo'?'todo':'memo',item,search))&&<></>}
      {editor}
      <div className={view === 'board' ? "memo-board" : `memo-all-list memo-collection ${view === 'todo' ? 'memo-todo-collection' : 'memo-note-collection'}`} ref={boardRef} onPointerMove={onPointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
        {(view === 'board' ? visibleItems : orderType(visibleItems, view === 'todo' ? 'todo' : 'memo', order)).map((item) => (
          <div key={item.id} className={`memo-item ${item.photo ? 'image' : item.type} ${item.done ? 'done' : ''}`} data-tone={item.tone}
            style={view !== 'board' ? { position: 'relative', left: 'auto', top: 'auto', width: '100%' } : { left: `clamp(0px, ${item.x}px, calc(100% - ${memoSize(item).width}px))`, top: `clamp(0px, ${item.y}px, calc(100% - ${memoSize(item).height}px))`, width: memoSize(item).width, height: memoSize(item).height, zIndex: layers.findIndex(entry => entry.id === item.id) + 1 }}>
            {view === 'board' && <span className="memo-magnet" title="拖动位置" onPointerDown={(event) => onPointerDown(event, item)} />}
            <button type="button" data-item-open className="memo-content-open" aria-label={item.type === 'todo' ? (item.done ? (view === 'board' ? '从板上收起：' : '标为未完成：') : '标为完成：') + item.text : item.text || '图片便签'} onClick={() => activateMemo(item)}>
              {item.photo ? <img src={item.photo} alt="便签板图片" draggable="false" /> : <span className="memo-card-content">{item.type === 'todo' && <span className="memo-check" aria-hidden="true">{item.done ? '✓' : ''}</span>}<span className="memo-card-text">{item.text}</span></span>}
            </button>
            <ContentActions orderItem={item} sortable={view !== 'board'} type={item.type==='todo'?'todo':'memo'} id={item.id} title={item.text}/><ContentCommand label={`删除 · ${item.text || item.photo?.name || '图片便签'}`} confirm run={() => persist(items.filter((memo) => memo.id !== item.id))} />
            <ContentCommand label={`编辑 · ${item.text || '图片便签'}`} run={() => setEditingMemo({ ...item })} />
            {view === 'board' && <span className="memo-resize" title="拖动调整大小" onPointerDown={(event) => onPointerDown(event, item, true)} />}
          </div>
        ))}
      </div>
    </FeaturePanel>
  );
}

export { DiaryPanel, MemoBoard };

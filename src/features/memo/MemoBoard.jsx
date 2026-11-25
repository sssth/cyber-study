import PhotoCrop, { cropStyle, useFilePreview } from '../PhotoCrop.jsx';
import EntityTagsField from '../../entities/EntityTagsField.jsx';
import { translate, translateError } from '../../i18n/index.js';
import useContentOrder from '../../ui/useContentOrder.js';
import { orderType } from '../../data/contentOrder.js';
import EditSurface from '../../ui/EditSurface.jsx';
import useResultSource, {resultEntities} from '../../results/useResultSource.js';
import { useNavigationState } from '../../ui/useNavigationState.js';
import DisplayViewMenu from '../../ui/DisplayViewMenu.jsx';
import { WorkspaceActions, WorkspaceFields } from '../ui.jsx';
import useEditSession from '../../ui/useEditSession.js';
import { ContentCommand } from '../ContentCommands.jsx';
import { useSearchCount, useSearchScope, SearchStatus } from '../../search/useSearchScope.jsx';
import { matchesItem } from '../../search/searchCore.js';
import ContentActions from '../ContentActions.jsx';
import { useMemo, useEffect, useRef, useState } from 'react';
import { memoPosition, mergeMemoChanges, memoSize, clickedTodo } from './memoLayout.js';
import { ActionWorkspace, FeaturePanel } from '../ui.jsx';
import { contentDataChangeEvent, createId, loadSpaceData, readImageFile, saveContentData } from '../../data/spaceStorage.js';


export default function MemoBoard({ onClose, editItem }) {
  const [view, setView] = useNavigationState('memo','view','board');
  const [showOnBoard, setShowOnBoard] = useState(true);
  const [stickyMode, setStickyMode] = useState('text');
  const order = useContentOrder();
  const [items, setItems] = useState(() => loadSpaceData('memo', []));
  const [editingMemo, setMemo] = useState(() => editItem ? items.find(item => item.id === editItem.id) : null);
  const setEditingMemo = value => { setMemo(value); if (!value && editItem) onClose(); };
  const search=useSearchScope({id:'memo',label:translate("i18n.memoBoard"),priority:10,filters:[{key:'type',label:translate("i18n.type"),options:[['memo',translate("i18n.note")],['todo',translate("i18n.toDo")]]},{key:'status',label:translate("i18n.toDoStatus"),options:[['open',translate("i18n.incomplete")],['done',translate("i18n.completed")]]}]});

  useEffect(() => {
    const refresh = event => {
      if (event.detail === 'memo') setItems(loadSpaceData('memo', []));
    };
    window.addEventListener(contentDataChangeEvent, refresh);
    return () => window.removeEventListener(contentDataChangeEvent, refresh);
  }, []);
  const visibleItems = useMemo(() => editItem ? [] : items.filter(item =>
    (view === 'board' ? item.showOnBoard !== false : view === 'todo' ? item.type === 'todo' : item.type !== 'todo')
    && matchesItem(item.type === 'todo' ? 'todo' : 'memo', item, search)
  ), [items, view, search, editItem]);
  useResultSource({ scopeId: 'memo', priority:10,enabled:!editItem,matches:visibleItems.flatMap(item=>resultEntities(item.type==='todo'?'todo':'memo',[item]))});
  useSearchCount('memo',visibleItems.length);
  const [boardMemoType, setMemoType] = useState('todo');
  const memoType = view === 'board' ? boardMemoType : view === 'todo' ? 'todo' : 'sticky';
  const [adding, setAdding] = useState(false);
  const imageInputRef = useRef(null);
  const [todoText, setTodoText] = useState('');
  const [stickyText, setStickyText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [newCrop,setNewCrop]=useState(null);
  const filePreview=useFilePreview(imageFile);
  const [error, setError] = useState('');
  const [tone, setTone] = useState('violet');
  const draggingRef = useRef(null);
  const boardRef = useRef(null);

  const persist = (next, baseline = items) => {
    next = mergeMemoChanges(loadSpaceData('memo', []), baseline, next);
    if (!saveContentData('memo', next)) { setError(translate("i18n.couldNotSaveLocalStorageMayBe")); return false; }
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
      if (addItem({ type: 'sticky', photo, photoCrop:newCrop, text: '', tone })) { setImageFile(null); if (imageInputRef.current) imageInputRef.current.value = ''; }
    } catch (error) { setError(error.message); }
    finally { setAdding(false); }
  };

  const onPointerDown = (event, item, resize = false) => {
    if (event.button !== 0) return;
    const element = event.currentTarget.closest('.memo-item');
    if (element.hasAttribute('data-bulk-selected')) return;
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

  const editor = (<ActionWorkspace command={false} showTrigger={false} kind="edit" label={translate("i18n.editNoteOrToDo")} title={translate("i18n.editContent")} open={Boolean(editingMemo)} onOpenChange={value => { if (!value) setEditingMemo(null); }}>
        {editingMemo && <form className="stack-form" onSubmit={event => {
          event.preventDefault();
          if (editingMemo.imageMode && !editingMemo.photo) { setError(translate("i18n.chooseAnImage")); return; }
          if (persist(items.map(item => item.id === editingMemo.id ? { ...editingMemo, type: editingMemo.type === 'image' ? 'sticky' : editingMemo.type } : item)) !== false) setEditingMemo(null);
        }}>
          <WorkspaceFields><EntityTagsField type={editingMemo.type === 'todo' ? 'todo' : 'memo'} item={editingMemo}/>
            <label><input type="checkbox" checked={editingMemo.showOnBoard !== false} onChange={event => setEditingMemo({ ...editingMemo, showOnBoard: event.target.checked, raisedAt: event.target.checked ? new Date().toISOString() : editingMemo.raisedAt })} />{translate("i18n.showOnBoard")}</label>
            {editingMemo.type !== 'todo' && <label>{translate("i18n.noteContent")}<select value={editingMemo.photo || editingMemo.imageMode ? 'image' : 'text'} onChange={event => setEditingMemo({ ...editingMemo, type: 'sticky', photo: event.target.value === 'text' ? '' : editingMemo.photo, imageMode: event.target.value === 'image' })}><option value="text">{translate("i18n.text")}</option><option value="image">{translate("i18n.imageOneOnly")}</option></select></label>}
            {!editingMemo.photo && !editingMemo.imageMode && <label>{translate("i18n.content")}<textarea value={editingMemo.text || ''} onChange={event => setEditingMemo({ ...editingMemo, text: event.target.value })} /></label>}
            <label>{translate("i18n.color")}<select value={editingMemo.tone || 'violet'} onChange={event => setEditingMemo({ ...editingMemo, tone: event.target.value })}><option value="violet">{translate("i18n.purple")}</option><option value="cyan">{translate("i18n.cyan")}</option><option value="amber">{translate("i18n.amber")}</option></select></label>
            {editingMemo.type === 'todo' && <label><input type="checkbox" checked={Boolean(editingMemo.done)} onChange={event => setEditingMemo({ ...editingMemo, done: event.target.checked, completedAt: event.target.checked ? new Date().toISOString() : null })} />{translate("i18n.completed")}</label>}
            {editingMemo.type !== 'todo' && (editingMemo.photo || editingMemo.imageMode) && <>{editingMemo.photo && <PhotoCrop src={editingMemo.photo} ratio={1} value={editingMemo.photoCrop} onChange={photoCrop=>setEditingMemo(m=>({...m,photoCrop}))}/>}<label>{translate("i18n.replaceImage")}<input type="file" accept="image/*" onChange={async event => {
              const file = event.target.files?.[0]; if (!file) return;
              try { const photo = await readImageFile(file); setEditingMemo(current => current ? { ...current, type: 'sticky', photo, photoCrop:null, text: '', imageMode: false } : current); } catch (failure) { setError(failure.message); }
            }} /></label></>}
            {error && <p role="alert" className="form-error">{translateError(error)}</p>}
          </WorkspaceFields>
          <WorkspaceActions><button>{translate("i18n.save")}</button>
          <button type="button" onClick={() => { if (window.confirm(translate("i18n.deleteThisItem")) && persist(items.filter(item => item.id !== editingMemo.id)) !== false) setEditingMemo(null); }}>{translate("i18n.delete")}</button></WorkspaceActions>
        </form>}
      </ActionWorkspace>);
  if (editItem) return editor;
  return (
    <FeaturePanel scopeId="memo" tipPage={`memo-${view}`} hasMenu wide title="i18n.memoBoard" scrollContext={view} kicker="Wall & Tasks" description={translate("i18n.dragToArrangeToDosNotesAnd")} onClose={onClose}>
      <nav className="globe-mode-switch" aria-label={translate("i18n.memoView")}>
        <button aria-pressed={view === 'board'} onClick={() => setView('board')}>{translate("i18n.memoBoard")}</button>
        <button aria-pressed={view === 'memo'} onClick={() => setView('memo')}>{translate("i18n.note")}</button>
        <button aria-pressed={view === 'todo'} onClick={() => setView('todo')}>{translate("i18n.toDo")}</button>
      </nav>
      <ActionWorkspace label={view === 'board' ? translate("i18n.newMemo") : view === 'todo' ? translate("i18n.newToDo") : translate("i18n.newNote")} title={view === 'board' ? translate("i18n.newMemo") : view === 'todo' ? translate("i18n.newToDo") : translate("i18n.newNote")}><div className="stack-form memo-create-form">
        <WorkspaceFields>
          {view === 'board' && <label>{translate("i18n.type")}<select value={memoType} disabled={adding} onChange={event => { setMemoType(event.target.value); setError(''); }}>
            <option value="todo">To Do</option><option value="sticky">{translate("i18n.note")}</option>
          </select></label>}
          {memoType === 'sticky' && <label>{translate("i18n.noteContent")}<select value={stickyMode} disabled={adding} onChange={event => setStickyMode(event.target.value)}><option value="text">{translate("i18n.text")}</option><option value="image">{translate("i18n.imageOneOnly")}</option></select></label>}
          {memoType === 'sticky' && stickyMode === 'image' ? <label className="file-label memo-image-picker">
            <span>{imageFile?.name || translate("i18n.chooseImage")}</span>
            <input ref={imageInputRef} aria-label={translate("i18n.chooseImage")} type="file" accept="image/*" disabled={adding} onChange={event => {setImageFile(event.target.files?.[0] || null);setNewCrop(null);}} />
          </label> : <label>{translate("i18n.text")}<textarea rows="4" value={memoType === 'todo' ? todoText : stickyText}
            placeholder={memoType === 'todo' ? translate("i18n.enterAToDo") : translate("i18n.enterYourNote")}
            onChange={event => memoType === 'todo' ? setTodoText(event.target.value) : setStickyText(event.target.value)} /></label>}
          {memoType==='sticky' && stickyMode==='image' && filePreview && <PhotoCrop src={filePreview} ratio={1} value={newCrop} onChange={setNewCrop}/>}
          <label><input type="checkbox" checked={showOnBoard} onChange={event => setShowOnBoard(event.target.checked)} />{translate("i18n.showOnBoard")}</label>
          <label>{translate("i18n.color")}<select value={tone} disabled={adding} onChange={event => setTone(event.target.value)}><option value="violet">{translate("i18n.purple")}</option><option value="cyan">{translate("i18n.cyan")}</option><option value="amber">{translate("i18n.amber")}</option></select></label>
          {error && <p role="alert" className="form-error">{translateError(error)}</p>}
        </WorkspaceFields>
        <WorkspaceActions><button type="button" onClick={memoType === 'todo' ? addTodo : stickyMode === 'image' ? addImage : addSticky}
          disabled={adding || (memoType === 'sticky' && stickyMode === 'image' ? !imageFile : !(memoType === 'todo' ? todoText : stickyText).trim())}>{adding ? translate("i18n.adding") : translate("i18n.add")}</button></WorkspaceActions>
      </div></ActionWorkspace>
      {error && <p className="form-error">{translateError(error)}</p>}
      <SearchStatus id="memo" label={translate("i18n.memoBoard")}/>
      {items.length>0&&!items.some(item=>matchesItem(item.type==='todo'?'todo':'memo',item,search))&&<></>}
      {editor}
      <div className={view === 'board' ? "memo-board" : `memo-all-list memo-collection ${view === 'todo' ? 'memo-todo-collection' : 'memo-note-collection'}`} data-scroll-memory={view === 'board' ? 'memo-canvas' : undefined} ref={boardRef} onPointerMove={onPointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
        {(view === 'board' ? visibleItems : orderType(visibleItems, view === 'todo' ? 'todo' : 'memo', order)).map((item) => (
          <div key={item.id} className={`memo-item ${item.photo ? 'image' : item.type} ${item.done ? 'done' : ''}`} data-tone={item.tone}
            style={view !== 'board' ? { position: 'relative', left: 'auto', top: 'auto', width: '100%' } : { left: `clamp(0px, ${item.x}px, calc(100% - ${memoSize(item).width}px))`, top: `clamp(0px, ${item.y}px, calc(100% - ${memoSize(item).height}px))`, width: memoSize(item).width, height: memoSize(item).height, zIndex: layers.findIndex(entry => entry.id === item.id) + 1 }}>
            {view === 'board' && <span className="memo-magnet" title={translate("i18n.dragToMove")} onPointerDown={(event) => onPointerDown(event, item)} />}
            <button type="button" data-item-open data-scroll-memory={`memo-${view}-${item.id}`} className="memo-content-open" aria-label={item.type === 'todo' ? (item.done ? (view === 'board' ? translate("i18n.hideFromBoard") : translate("i18n.markIncomplete")) : translate("i18n.markComplete")) + item.text : item.text || translate("i18n.imageNote")} onClick={() => activateMemo(item)}>
              {item.photo ? <img style={{...cropStyle(item.photoCrop),aspectRatio:1,objectFit:"cover"}} src={item.photo} alt={translate("i18n.memoBoardImage")} draggable="false" /> : <span className="memo-card-content">{item.type === 'todo' && <span className="memo-check" aria-hidden="true">{item.done ? '✓' : ''}</span>}<span className="memo-card-text">{item.text}</span></span>}
            </button>
            <ContentActions orderItem={item} sortable={view !== 'board'} type={item.type==='todo'?'todo':'memo'} id={item.id} title={item.text}/><ContentCommand label={translate("i18n.delete03", item.text || item.photo?.name || translate('i18n.imageNote'))} confirm run={() => persist(items.filter((memo) => memo.id !== item.id))} />
            <ContentCommand label={translate("i18n.edit03", item.text || translate('i18n.imageNote'))} run={() => setEditingMemo({ ...item })} />
            {view === 'board' && <span className="memo-resize" title={translate("i18n.dragToResize")} onPointerDown={(event) => onPointerDown(event, item, true)} />}
          </div>
        ))}
      </div>
    </FeaturePanel>
  );
}


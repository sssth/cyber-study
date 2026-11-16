import { matchesShortcut } from '../data/shortcuts.js';
import { useEffect, useRef, useState } from 'react';
import { memoPosition } from './memoLayout.js';
import { FeaturePanel, EmptyState } from './ui.jsx';
import { createId, loadSpaceData, readImageFile, saveSpaceData } from '../data/spaceStorage.js';

function DiaryPanel({ onClose }) {
  const [entries, setEntries] = useState(() => loadSpaceData('diary', []));
  const [draft, setDraft] = useState({ mood: '平静', text: '', photo: '' });
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');

  const [mode, setMode] = useState('write');
  const [date, setDate] = useState('');
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState(null);
  const [editing, setEditing] = useState(null);
  const [prefs, setPrefs] = useState(() => loadSpaceData('diary-prefs', { pen: '钢笔', sound: false, animation: true }));
  const soundRef = useRef(null);

  useEffect(() => () => { soundRef.current?.close(); }, []);

  const setPreference = (key, value) => {
    const next = { ...prefs, [key]: value };
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

  const filtered = entries.filter((entry) => {
    const entryDate = new Date(entry.date).toLocaleDateString('sv-SE');
    const haystack = `${entry.text} ${entry.mood}`.toLocaleLowerCase();
    return (!date || entryDate === date) && (!query.trim() || haystack.includes(query.trim().toLocaleLowerCase()));
  }).sort((a, b) => b.date.localeCompare(a.date));

  const addEntry = () => {
    if (!draft.text.trim() && !draft.photo) return;
    const next = editing ? entries.map((entry) => entry.id === editing ? { ...entry, ...draft } : entry)
      : [{ id: createId('diary'), date: new Date().toISOString(), ...draft }, ...entries];
    if (!persist(next)) return;
    setDraft({ mood: '平静', text: '', photo: '' });
    setEditing(null);
    setMode('read');
    setDate('');
    setQuery('');
    setOpened(editing ?? next[0].id);
  };

  const generateSummary = () => {
    const today = new Date().toDateString();
    const todayEntries = entries.filter((entry) => new Date(entry.date).toDateString() === today);
    const memos = loadSpaceData('memo', []);
    const notes = loadSpaceData('knowledge', { notes: [] }).notes ?? [];
    const todayNotes = notes.filter((note) => new Date(note.createdAt).toDateString() === today);
    const openTodos = memos.filter((item) => item.type === 'todo' && !item.done).length;
    setSummary(`今日日记 ${todayEntries.length} 篇，摘录 ${todayNotes.length} 条，未完成 To-do ${openTodos} 项。此汇总仅在本机生成，未调用AI。`);
  };

  return (
    <FeaturePanel title="日记本" kicker="Private Diary" description="自由日记与照片本地保存；每日汇总需主动触发，私密内容默认不供AI读取。" onClose={onClose}>
      <div className="card-actions">
        <button type="button" aria-pressed={mode === 'write'} onClick={() => setMode('write')}>书写模式</button>
        <button type="button" aria-pressed={mode === 'read'} onClick={() => setMode('read')}>阅读模式</button>
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
      {mode === 'write' ? <div className={`stack-form diary-paper ${prefs.pen === '羽毛笔' ? 'diary-quill' : ''}`}>
        <label>书写工具 <select value={prefs.pen} onChange={(event) => setPreference('pen', event.target.value)}><option>钢笔</option><option>羽毛笔</option></select></label>
        <label><input type="checkbox" checked={prefs.sound} onChange={(event) => setPreference('sound', event.target.checked)} /> 书写音效</label>
        <label><input type="checkbox" checked={prefs.animation} onChange={(event) => setPreference('animation', event.target.checked)} /> 字迹动画</label>
        <select value={draft.mood} onChange={(event) => setDraft((draftItem) => ({ ...draftItem, mood: event.target.value }))}>
          {[...new Set(['平静', '专注', '愉悦', '疲惫', '低落', '明亮', draft.mood])].map((mood) => <option key={mood}>{mood}</option>)}
        </select>
        <textarea value={draft.text} onChange={(event) => {
          scratch();
          if (prefs.animation && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            event.currentTarget.getAnimations().forEach((animation) => animation.cancel());
            event.currentTarget.animate([{ color: '#765f4c' }, { color: '#3d2a21' }], 180);
          }
          setDraft((draftItem) => ({ ...draftItem, text: event.target.value }));
        }} rows="6" placeholder="今天发生了什么？" />
        <label className="file-label">添加照片<input type="file" accept="image/*" onChange={async (event) => {
          try { setError(''); const photo = await readImageFile(event.target.files?.[0]);
          setDraft((draftItem) => ({ ...draftItem, photo })); }
          catch (error) { setError(error.message); }
          event.target.value = '';
        }} /></label>
        {draft.photo && <img className="preview-image" src={draft.photo} alt="待保存照片预览" />}
        <button type="button" onClick={addEntry}>{editing ? '保存修改' : '保存今日'}</button>
        <button type="button" onClick={generateSummary}>生成本机活动汇总</button>
        {summary && <p className="summary-box">{summary}</p>}
      </div> : <div className="admin-list diary-paper">
        <div className="panel-toolbar">
          <label>日期 <input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <input aria-label="日记关键词" placeholder="搜索日记关键词" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        {!filtered.length && <EmptyState>没有匹配的日记。</EmptyState>}
        {filtered.map((entry) => (
          <article className="diary-entry" key={entry.id}>
            <button type="button" aria-expanded={opened === entry.id} onClick={() => setOpened(opened === entry.id ? null : entry.id)}>
              {new Date(entry.date).toLocaleString('zh-CN')} · {entry.mood} · {entry.text?.slice(0, 32) || '照片'}
            </button>
            {opened === entry.id && <div>
              <p>{entry.text}</p>
              {entry.photo && <img className="preview-image" src={entry.photo} alt="日记照片" />}
              <div className="card-actions">
                <button type="button" onClick={() => { setDraft({ text: entry.text, photo: entry.photo, mood: entry.mood }); setEditing(entry.id); setMode('write'); }}>编辑</button>
                <button type="button" onClick={() => persist(entries.filter((item) => item.id !== entry.id))}>删除</button>
              </div>
            </div>}
          </article>
        ))}
      </div>}
    </FeaturePanel>
  );
}

function MemoBoard({ onClose, shortcuts }) {
  const [items, setItems] = useState(() => loadSpaceData('memo', []));
  const [todoText, setTodoText] = useState('');
  const [stickyText, setStickyText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [error, setError] = useState('');
  const [tone, setTone] = useState('violet');
  const draggingRef = useRef(null);
  const boardRef = useRef(null);

  const persist = (next) => {
    if (!saveSpaceData('memo', next)) { setError('保存失败，本地存储可能已满。'); return false; }
    setItems(next);
    setError('');
    return true;
  };

  const addItem = (item) => {
    const board = boardRef.current;
    const position = memoPosition(items, item.type, board.clientWidth, board.clientHeight);
    return persist([...items, { id: createId(item.type), ...position, ...item }]);
  };

  const addTodo = () => {
    if (!todoText.trim()) return;
    if (addItem({ type: 'todo', text: todoText.trim(), done: false })) setTodoText('');
  };

  const addSticky = () => {
    if (!stickyText.trim()) return;
    if (addItem({ type: 'sticky', text: stickyText.trim(), tone })) setStickyText('');
  };

  const addImage = async () => {
    try {
      const photo = await readImageFile(imageFile);
      if (addItem({ type: 'image', photo })) setImageFile(null);
    } catch (error) { setError(error.message); }
  };

  const onPointerDown = (event, item, resize = false) => {
    if (event.button !== 0) return;
    const element = event.currentTarget.closest('.memo-item');
    draggingRef.current = {
      item, resize, startX: event.clientX, startY: event.clientY,
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
      height: Math.max(84, Math.min(board.clientHeight - drag.y, drag.height + dy))
    } : {
      x: Math.max(0, Math.min(board.clientWidth - drag.width, drag.x + dx)),
      y: Math.max(0, Math.min(board.clientHeight - drag.height, drag.y + dy))
    };
    setItems((list) => list.map((item) => item.id === drag.item.id ? { ...item, ...next } : item));
  };

  const finishDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    if (!persist(items)) setItems(loadSpaceData('memo', []));
  };

  return (
    <FeaturePanel wide title="Memo 板" kicker="Wall & Tasks" description="To-do、便签与图片固定在同一块板上，可拖拽排列，全部本地保存。" onClose={onClose}>
      <div className="stack-form horizontal">
        <input value={todoText} onChange={(event) => setTodoText(event.target.value)} placeholder="新增 To-do" onKeyDown={(event) => {
          if (!matchesShortcut(event, shortcuts.addTodo)) return;
          event.preventDefault();
          if (!event.repeat) addTodo();
        }} />
        <button type="button" onClick={addTodo}>添加</button>
        <input value={stickyText} onChange={(event) => setStickyText(event.target.value)} placeholder="新增便签" />
        <select aria-label="便签颜色" value={tone} onChange={(event) => setTone(event.target.value)}><option value="violet">紫色</option><option value="cyan">青色</option><option value="amber">琥珀色</option></select>
        <button type="button" onClick={addSticky}>贴上</button>
        <label className="file-label">选择图片<input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0])} /></label>
        <button type="button" onClick={addImage} disabled={!imageFile}>固定</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="memo-board" ref={boardRef} onPointerMove={onPointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
        {items.length === 0 ? <EmptyState>板上暂无内容。</EmptyState> : items.map((item) => (
          <div key={item.id} className={`memo-item ${item.type} ${item.done ? 'done' : ''}`} data-tone={item.tone}
            style={{ left: `clamp(0px, ${item.x}px, calc(100% - ${item.width ?? 180}px))`, top: `clamp(0px, ${item.y}px, calc(100% - ${item.height ?? (item.type === 'image' ? 140 : 96)}px))`, width: item.width, height: item.height }}>
            <span className="memo-magnet" title="拖动位置" onPointerDown={(event) => onPointerDown(event, item)} />
            {item.type === 'image' ? <img src={item.photo} alt="便签板图片" draggable="false" /> : item.type === 'todo' ? (
              <button type="button" className="memo-task" aria-label={item.done ? `移除已完成待办 ${item.text}` : `完成待办 ${item.text}`} onClick={() => persist(item.done
                ? items.filter((memo) => memo.id !== item.id)
                : items.map((memo) => memo.id === item.id ? { ...memo, done: true } : memo))}><span>{item.text}</span></button>
            ) : <p>{item.text}</p>}
            {item.type !== 'todo' && <button type="button" className="memo-remove" aria-label="移除面板" onClick={() => persist(items.filter((memo) => memo.id !== item.id))}>×</button>}
            <span className="memo-resize" title="拖动调整大小" onPointerDown={(event) => onPointerDown(event, item, true)} />
          </div>
        ))}
      </div>
    </FeaturePanel>
  );
}

export { DiaryPanel, MemoBoard };

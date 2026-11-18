import useContentOrder from '../../ui/useContentOrder.js';
import { orderType } from '../../data/contentOrder.js';
import { moveBefore } from '../../data/contentOrder.js';
import { WorkspaceActions } from '../ui.jsx';
import { ContentCommand, ContentEditButton } from '../ContentCommands.jsx';
import { ActionWorkspace } from '../ui.jsx';
import {useSearchScope,SearchStatus,dateFilters} from '../../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../../search/searchCore.js';
import ContentActions from '../ContentActions.jsx';
import { useRef, useState } from 'react';
import { loadCities, nodeById } from './geography.js';

const blank = { title: '', location: '', caption: '', date: '', time: '', country: '', region: '', city: '', cityId: '', latitude: '', longitude: '', visitStatus: 'wish' };
const label = p => p.title || p.location || p.filename || p.caption?.slice(0, 40) || '未命名记忆点';

export default function MemoryEditor({ mode, photos, journeys, editJourney, onClose, error, busy, request, onView, onBrowsePoints, initialPoint, onSaved, onDelete, searchState, workspaceHost }) {
  const order = useContentOrder();
  const [point, setPoint] = useState(() => ({ ...blank, ...initialPoint }));
  const [journey, setJourney] = useState(editJourney || { title: '', note: '', pointIds: [] });
  const [cities, setCities] = useState([]);
  const [query, setQuery] = useState(initialPoint?.city || initialPoint?.location || '');
  const [searching, setSearching] = useState(false);
  const [cityError, setCityError] = useState('');
  const [citiesLoading, setCitiesLoading] = useState(false);
  const fetchCities = async () => {
    if (cities.length || citiesLoading) return;
    setCitiesLoading(true); setCityError('');
    try { setCities(await loadCities()); }
    catch { setCityError('城市目录暂不可用，请重新点击搜索框重试。'); }
    finally { setCitiesLoading(false); }
  };
  const [remove, setRemove] = useState(false);
  const active = photos.filter(p => !p.deletedAt);
  const byId = new Map(photos.map(p => [p.id, p]));
  const set = (key, value) => setPoint(p => ({ ...p, [key]: value, ...(['latitude', 'longitude', 'city', 'region', 'country'].includes(key) ? { cityId: '' } : {}) }));
  const savePoint = async attach => {
    const coordinate = value => String(value ?? '').trim() === '' ? null : Number(value);
    const result = await request('point', { ...point, attach, latitude: coordinate(point.latitude), longitude: coordinate(point.longitude) });
    if (result && !result.canceled) {
      if (onSaved) { onSaved(result.photos?.find(p=>!photos.some(old=>old.id===p.id)) || result.photos?.find(p=>p.id===point.id)); }
      else { setPoint(blank); setQuery(''); }
    }
  };
  const draggedStop = useRef(null);
  const candidates = active.filter(p => matchesItem('memory_point', p, searchState));
  const [journeyEditorOpen, setOpen] = useState(Boolean(editJourney));
  const setJourneyEditorOpen = open => {setOpen(open); if (!open && editJourney) onClose();};
  if (mode === 'journey') { const editor = (<ActionWorkspace portalHost={workspaceHost} disabled={busy} onCreate={() => { setRemove(false); setJourney({ title: '', note: '', pointIds: [] }); }} label="新建旅程" title={journey.id ? "编辑旅程" : "新建旅程"} open={journeyEditorOpen} onOpenChange={setJourneyEditorOpen}><form className="stack-form" onSubmit={async e => { e.preventDefault(); if (await request('journey', journey)) setJourneyEditorOpen(false); }}>
      {error && <p role="alert">{error}</p>}
      <h3>{journey.id ? '编辑旅程' : '新建旅程'}</h3>
      <label>旅程名称<input required maxLength={200} value={journey.title} onChange={e => setJourney({ ...journey, title: e.target.value })} /></label>
      <label>旅程说明<textarea value={journey.note} onChange={e => setJourney({ ...journey, note: e.target.value })} /></label>
      <label>开始日期<input type="date" value={journey.startDate||''} onChange={e=>setJourney({...journey,startDate:e.target.value})}/></label><label>结束日期<input type="date" value={journey.endDate||''} onChange={e=>setJourney({...journey,endDate:e.target.value})}/></label>
      <fieldset className="music-create-song-picker memory-journey-picker">
        <legend>添加记忆点</legend>
        <div className="music-create-song-options">
          {candidates.length ? candidates.map(p => <label key={p.id}>
            <input type="checkbox" disabled={busy} checked={journey.pointIds.includes(p.id)} onChange={event => {
              const checked = event.target.checked;
              setJourney(current => ({ ...current, pointIds: checked ? [...new Set([...current.pointIds, p.id])] : current.pointIds.filter(id => id !== p.id) }));
            }} />
            <span>{label(p)}{p.title && p.location ? ` · ${p.location}` : ''}{p.date ? ` · ${p.date}` : ''}</span>
          </label>) : <></>}
        </div>
      </fieldset>
      <ul className="memory-journey-stops">{journey.pointIds.map(id => <li key={id} draggable={!busy}
        onDragStart={e => { draggedStop.current = id; e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { draggedStop.current = null; }}
        onDragOver={e => { if (!busy && draggedStop.current && draggedStop.current !== id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
        onDrop={e => { e.preventDefault(); const source = draggedStop.current; if (!busy && source) setJourney(current => ({ ...current, pointIds: moveBefore(current.pointIds, source, id) })); draggedStop.current = null; }}>
        <button type="button" disabled={busy} onDoubleClick={event => { event.stopPropagation(); if (!busy && window.confirm('从这段旅程中删除这个记忆点？记忆点本身会保留。')) setJourney(current => ({ ...current, pointIds: current.pointIds.filter(value => value !== id) })); }}><span className="journey-stop-title">{label(byId.get(id) || {})}</span><span className="journey-stop-place">{byId.get(id)?.city || byId.get(id)?.location || ''}</span></button>
      </li>)}</ul>
      {journey.id && onView && <button type="button" disabled={busy} onClick={() => { setJourneyEditorOpen(false); onView(journey.id); }}>在地球上查看</button>}
      <WorkspaceActions><button disabled={busy}>保存</button>
      {journey.id && !remove && <ContentEditButton label="删除" disabled={busy} run={() => setRemove(true)} />}</WorkspaceActions>
      {journey.id && remove && <div role="group" aria-label="确认删除旅程"><p>删除这段旅程后，记忆点仍会保留。</p><button type="button" onClick={() => setRemove(false)}>取消</button><button type="button" disabled={busy} onClick={async () => { if (await request('journey', { id: journey.id, remove: true })) { setJourneyEditorOpen(!editJourney); setRemove(false); setJourney({ title: '', note: '', pointIds: [] }); } }}>确认删除旅程</button></div>}
    </form></ActionWorkspace>);
  if (editJourney) return editor;
  return <div className="globe-library-layout journey-library-layout">
    <section className="journey-card-grid">

      {orderType(journeys,'journey',order).filter(j=>matchesItem('journey',j,searchState)).map(j => <article key={j.id} className="admin-card journey-summary-card" onClick={event => { if (journeyEditorOpen && !busy && !event.target.closest('button')) { setRemove(false); setJourney(j); } }}>
        <ContentActions orderItem={j} type="journey" id={j.id} title={j.title} preview={false}/><div className="journey-summary-content"><div className="journey-summary-heading"><h3>{j.title}</h3><span>{j.pointIds.length} 个记忆点</span></div>
          {(j.startDate || j.endDate) && <p className="journey-summary-dates">{j.startDate || '未定'} — {j.endDate || '未定'}</p>}
          </div>
        <button type="button" data-item-open className="memory-card-edit" disabled={busy} aria-label={`查看旅程：${j.title}`} onClick={() => onBrowsePoints?.(j.id)} />
        <div className="globe-toolbar"><ContentCommand label={`编辑旅程 · ${j.title}`} disabled={busy} run={() => { setJourneyEditorOpen(true); setRemove(false); setJourney(j); }} /></div>
      </article>)}
    </section>
    {editor}
  </div>;
  }
  const search = searching ? query.trim().toLowerCase() : '';
  const matches = search ? cities.filter(c => [c.name, c.name_ascii, c.aliases].some(name => name?.toLowerCase().includes(search))).slice(0, 10) : [];
  return <form className="stack-form memory-point-form" onSubmit={e => { e.preventDefault(); savePoint(false); }}>
    {!point.id && <div className="globe-toolbar"><button type="button" disabled={busy} onClick={() => request('import', { folder: false })}>导入照片</button><button type="button" disabled={busy} onClick={() => request('import', { folder: true })}>导入文件夹</button></div>}
    <h3>{point.id ? '编辑记忆点' : '新建记忆点'}</h3>
    <label>记忆名称<input maxLength={200} value={point.title || ''} onChange={e => set('title', e.target.value)} placeholder="为这段记忆起个名字" /></label>
    <label>到访状态<select value={point.visitStatus} onChange={e => set('visitStatus', e.target.value)}><option value="visited">去过</option><option value="wish">想去</option></select></label>
    <label>搜索离线城市<input value={query} onFocus={fetchCities} onChange={e => { setQuery(e.target.value); setSearching(true); }} /></label>
    {cityError && <p role="alert">{cityError}</p>}
    {citiesLoading && <p role="status">正在加载城市…</p>}

    <div className="globe-toolbar" hidden={!matches.length}>{matches.map(c => <button key={c.id} type="button" onClick={() => {
      setPoint({ ...point, location: c.name, city: c.name, cityId: c.id, country: nodeById.get(c.country_id)?.name || '', region: nodeById.get(c.region_id)?.name || '', latitude: c.latitude, longitude: c.longitude }); setQuery(c.name); setSearching(false);
    }}>{c.name} · {[nodeById.get(c.country_id)?.name, nodeById.get(c.region_id)?.name].filter(Boolean).join(' / ')}</button>)}</div>
    {(point.city || point.location) && <p className="card-meta" aria-label="已选地点">{[point.country, point.region, point.city || point.location].filter(Boolean).join(' / ')}</p>}
    <label>日期<input type="date" value={point.date || ''} onChange={e => set('date', e.target.value)} /></label>
    <label>记忆文字<textarea value={point.caption} onChange={e => set('caption', e.target.value)} /></label>
    {point.thumbnail && <img className="preview-image" src={point.thumbnail} alt="记忆点照片" />}

    {point.id && <button type="button" disabled={busy} onClick={() => savePoint(true)}>更换照片并保存</button>}<WorkspaceActions><button disabled={busy}>保存</button>{point.id && onDelete && <ContentEditButton label="删除" disabled={busy} run={() => onDelete(point.id)} />}</WorkspaceActions>
  </form>;
}

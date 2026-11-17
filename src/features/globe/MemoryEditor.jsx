import { ContentCommand, ContentEditButton } from '../ContentCommands.jsx';
import { ActionWorkspace } from '../ui.jsx';
import {useSearchScope,SearchStatus,dateFilters} from '../../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../../search/searchCore.js';
import ContentActions from '../ContentActions.jsx';
import { useState } from 'react';
import { loadCities, nodeById } from './geography.js';

const blank = { location: '', caption: '', date: '', time: '', country: '', region: '', city: '', cityId: '', latitude: '', longitude: '', visitStatus: 'wish' };
const label = p => p.location || p.filename || p.caption?.slice(0, 40) || '未命名记忆点';

export default function MemoryEditor({ mode, photos, journeys, busy, request, onView, initialPoint, onSaved, onDelete, searchState }) {
  const [point, setPoint] = useState(() => ({ ...blank, ...initialPoint }));
  const [journey, setJourney] = useState({ title: '', note: '', pointIds: [] });
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
  const [addingTo,setAddingTo]=useState(null);
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
  const changeOrder = (index, offset) => {
    const ids = [...journey.pointIds];
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    setJourney({ ...journey, pointIds: ids });
  };
  const [journeyEditorOpen, setJourneyEditorOpen] = useState(false);
  if(addingTo)return <div><ContentCommand kind="cancel-create" label="取消新增旅程记忆点" disabled={busy} run={() => setAddingTo(null)} /><button onClick={()=>setAddingTo(null)}>返回旅程</button><MemoryEditor mode="point" photos={photos} journeys={journeys} busy={busy} request={request} onSaved={async point=>{if(point){const ok=await request('journey',{...addingTo,pointIds:[...addingTo.pointIds,point.id]});if(ok)setAddingTo(null);}}}/></div>;
  if (mode === 'journey') return <div className="globe-library-layout">
    <section className="stack-form">
      <h3>我的旅程</h3>

      {journeys.filter(j=>matchesItem('journey',j,searchState)).map(j => <article key={j.id} className="admin-card">
        <ContentActions type="journey" id={j.id} title={j.title}/><div><h3>{j.title}</h3><p>{j.pointIds.length} 个记忆点</p></div>
        <div className="globe-toolbar"><ContentCommand kind="create" label={`为「${j.title}」新增记忆点`} disabled={busy} run={() => setAddingTo(j)} /><ContentCommand label={`编辑旅程 · ${j.title}`} disabled={busy} run={() => { setJourneyEditorOpen(true); setRemove(false); setJourney(j); }} /><button data-item-open disabled={busy} onClick={() => onView(j.id)}>在地球上查看</button></div>
      </article>)}
    </section>
    <ActionWorkspace disabled={busy} onCreate={() => { setRemove(false); setJourney({ title: '', note: '', pointIds: [] }); }} label="新建旅程" title="旅程编辑" open={journeyEditorOpen} onOpenChange={setJourneyEditorOpen}><form className="stack-form globe-organizer" onSubmit={async e => { e.preventDefault(); if (await request('journey', journey)) setJourney({ title: '', note: '', pointIds: [] }); }}>
      <h3>{journey.id ? '编辑旅程' : '新建旅程'}</h3>
      <label>旅程名称<input required maxLength={200} value={journey.title} onChange={e => setJourney({ ...journey, title: e.target.value })} /></label>
      <label>旅程说明<textarea value={journey.note} onChange={e => setJourney({ ...journey, note: e.target.value })} /></label>
      <label>开始日期<input type="date" value={journey.startDate||''} onChange={e=>setJourney({...journey,startDate:e.target.value})}/></label><label>结束日期<input type="date" value={journey.endDate||''} onChange={e=>setJourney({...journey,endDate:e.target.value})}/></label><label>添加记忆点<select value="" onChange={e => { if (e.target.value) setJourney({ ...journey, pointIds: [...journey.pointIds, e.target.value] }); }}>
        <option value="">选择已有记忆点</option>
        {active.filter(p => !journey.pointIds.includes(p.id)).map(p => <option key={p.id} value={p.id}>{label(p)}{p.date ? ` · ${p.date}` : ''}</option>)}
      </select></label>
      <ol className="memory-journey-stops">{journey.pointIds.map((id, index) => <li key={id}>
        <span>{label(byId.get(id) || {})}{byId.get(id)?.deletedAt ? '（回收站）' : ''}</span>
        <button type="button" disabled={index === 0} onClick={() => changeOrder(index, -1)}>上移</button>
        <button type="button" disabled={index === journey.pointIds.length - 1} onClick={() => changeOrder(index, 1)}>下移</button>
        <button type="button" onClick={() => setJourney({ ...journey, pointIds: journey.pointIds.filter(value => value !== id) })}>移出</button>
      </li>)}</ol>
      <button disabled={busy}>保存旅程</button>
      {journey.id && !remove && <ContentEditButton label="删除旅程" disabled={busy} run={() => setRemove(true)} />}
      {journey.id && remove && <div role="group" aria-label="确认删除旅程"><p>删除这段旅程后，记忆点仍会保留。</p><button type="button" onClick={() => setRemove(false)}>取消</button><button type="button" disabled={busy} onClick={async () => { if (await request('journey', { id: journey.id, remove: true })) { setJourneyEditorOpen(true); setRemove(false); setJourney({ title: '', note: '', pointIds: [] }); } }}>确认删除旅程</button></div>}
    </form></ActionWorkspace>
  </div>;
  const search = searching ? query.trim().toLowerCase() : '';
  const matches = search ? cities.filter(c => [c.name, c.name_ascii, c.aliases].some(name => name?.toLowerCase().includes(search))).slice(0, 10) : [];
  return <form className="stack-form globe-organizer memory-point-form" onSubmit={e => { e.preventDefault(); savePoint(false); }}>
    <h3>{point.id ? '编辑记忆点' : '新建记忆点'}</h3>
    <label>到访状态<select value={point.visitStatus} onChange={e => set('visitStatus', e.target.value)}><option value="visited">去过</option><option value="wish">想去</option></select></label>
    <label>搜索离线城市<input value={query} onFocus={fetchCities} placeholder="输入城市名称，再选择搜索结果" onChange={e => { setQuery(e.target.value); setSearching(true); }} /></label>
    {cityError && <p role="alert">{cityError}</p>}
    {citiesLoading && <p role="status">正在加载城市…</p>}
    {search && !citiesLoading && !cityError && cities.length > 0 && !matches.length && <p className="card-meta">没有匹配的城市，请尝试其他名称。</p>}
    <div className="globe-toolbar">{matches.map(c => <button key={c.id} type="button" onClick={() => {
      setPoint({ ...point, location: c.name, city: c.name, cityId: c.id, country: nodeById.get(c.country_id)?.name || '', region: nodeById.get(c.region_id)?.name || '', latitude: c.latitude, longitude: c.longitude }); setQuery(c.name); setSearching(false);
    }}>{c.name} · {[nodeById.get(c.country_id)?.name, nodeById.get(c.region_id)?.name].filter(Boolean).join(' / ')}</button>)}</div>
    {(point.city || point.location) && <p className="card-meta" aria-label="已选地点">{[point.country, point.region, point.city || point.location].filter(Boolean).join(' / ')}</p>}
    <label>日期<input type="date" value={point.date || ''} onChange={e => set('date', e.target.value)} /></label>
    <label>记忆文字<textarea value={point.caption} onChange={e => set('caption', e.target.value)} /></label>
    {point.thumbnail && <img className="preview-image" src={point.thumbnail} alt="记忆点照片" />}

    <div className="globe-toolbar"><button disabled={busy}>保存记忆点</button>{point.id && onDelete && <ContentEditButton label="删除记忆点" disabled={busy} run={() => onDelete(point.id)} />}<button type="button" disabled={busy} onClick={() => savePoint(true)}>选择照片并保存</button></div>
  </form>;
}

import { ContentCommand } from '../ContentCommands.jsx';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useGeography, { GeographyPanel } from './useGeography.jsx';
import { nodeById } from './geography.js';
import { memoryPlaces } from './geo.js';
import '../../styles/globe.css';
import ContentActions from '../ContentActions.jsx';
const GlobeScene = lazy(() => import('./GlobeScene.jsx'));

export default function GlobeBrowser({ photos, loading, onOrganize, onOpenPhoto, journeys = [], journeyId, setJourneyId }) {
  const places = useMemo(() => memoryPlaces(photos), [photos]);
  const [explore, setExplore] = useState(true);
  const [selectedId, setSelectedId] = useState(null), [photoIndex, setPhotoIndex] = useState(0);
  const [limit, setLimit] = useState(40);
  const [rotating, setRotating] = useState(false), [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [command, setCommand] = useState(null), [failed, setFailed] = useState(false), [ready, setReady] = useState(false), [retry, setRetry] = useState(0);
  const search = useRef(), card = useRef(), returnTarget = useRef();
  const journey = journeys.find(j => j.id === journeyId);
  const stops = journey?.pointIds.map(id => photos.find(p => p.id === id && !p.deletedAt)).filter(Boolean) ?? [];
  const highlighted = useMemo(() => new Set(journeys.find(j => j.id === journeyId)?.pointIds ?? []), [journeys, journeyId]);
  const selected = places.find(place => place.id === selectedId);
  const shown = selected?.photos[photoIndex % selected.photos.length];
  const results = places;
  const issue = useCallback(values => { setRotating(false); setCommand({ ...values, serial: performance.now() }); }, []);
  const geography = useGeography(issue, explore && !selected);
  const choose = useCallback(place => { returnTarget.current = document.activeElement; setSelectedId(place.id); setPhotoIndex(0); issue({ type: 'place', place }); }, [issue]);
  const closeCard = useCallback(() => { setSelectedId(null); returnTarget.current?.focus?.(); }, []);
  const readyScene = useCallback(() => setReady(true), []), failScene = useCallback(() => { setFailed(true); setReady(false); }, []), stopRotation = useCallback(() => setRotating(false), []);
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => { setReduced(media.matches); if (media.matches) setRotating(false); }; media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  useEffect(() => { if (selectedId) card.current?.focus(); }, [selectedId]);
  useEffect(() => { if (reduced) setRotating(false); }, [reduced]);
  useEffect(() => { const pause = () => { if (document.hidden) setRotating(false); }; document.addEventListener('visibilitychange', pause); return () => document.removeEventListener('visibilitychange', pause); }, []);
  const onKeys = event => {
    if (event.isComposing || event.target.matches('input, textarea') || event.target.closest('.globe-photo-viewer')) return;
    if (event.key === 'Escape' && selected) { event.preventDefault(); event.stopPropagation(); closeCard(); }
    if (selected && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setPhotoIndex(i => (i + (event.key === 'ArrowRight' ? 1 : -1) + selected.photos.length) % selected.photos.length); }
  };
  return <section className="memory-atlas" data-reduced-motion={reduced} aria-label="3D 记忆地球" onKeyDown={onKeys}>
    <div className="atlas-heading"><div><p className="atlas-eyebrow">我的足迹</p><h3>把记忆，放回世界。</h3></div><span>{places.length} 个地点 · {places.reduce((sum, p) => sum + p.photos.length, 0)} 条记忆</span></div>
    <nav className="atlas-breadcrumbs" aria-label="地理层级"><button onClick={()=>{setSelectedId(null);geography.navigate(null);}}>世界</button>{geography.region?.parent_id && <><span>／</span><button onClick={()=>geography.navigate(nodeById.get(geography.region.parent_id))}>{nodeById.get(geography.region.parent_id)?.name}</button></>}{geography.region&&<><span>／</span><button onClick={()=>geography.navigate(geography.region)}>{geography.region.name}</button></>}{geography.city&&<span>／{geography.city.name}</span>}</nav>
    <div className="atlas-layout">
      <div className="atlas-stage" aria-label="可旋转的三维地球">
        {!failed && <Suspense fallback={<p className="atlas-loading" role="status">正在准备地球…</p>}><GlobeScene highlighted={highlighted} geography={geography} key={retry} places={places} selected={selectedId} onSelect={choose} command={command} rotating={rotating} reduced={reduced} onInteract={stopRotation} onReady={readyScene} onFailure={failScene} /></Suspense>}
        {!ready && !failed && <p className="atlas-loading" role="status">正在绘制地球…</p>}
        {failed && <div className="atlas-fallback" role="alert"><h4>暂时无法显示 3D 地球</h4><p>照片仍可从右侧地点列表浏览。</p><button onClick={() => { setFailed(false); setRetry(i => i + 1); }}>重试 3D</button></div>}
        <div className="atlas-stage-caption"><span>离线底图 · Natural Earth</span></div>
        <div className="atlas-controls" aria-label="地球控制">
          <button disabled={failed} onClick={() => issue({ type: 'zoom', factor: .8 })} aria-label="放大地球">＋</button><button disabled={failed} onClick={() => issue({ type: 'zoom', factor: 1.25 })} aria-label="缩小地球">−</button>
          <button disabled={failed} onClick={() => { closeCard(); geography.navigate(null); }}>全球视角</button>
          <button disabled={failed || reduced} aria-pressed={rotating} onClick={() => setRotating(value => !value)}>{rotating ? '停止旋转' : '自动旋转'}</button>
          <button aria-pressed={reduced} onClick={() => setReduced(value => !value)}>减少动态</button>
          <details><summary>转动方向</summary><div className="atlas-directions">{[['向左转', -.3, 0], ['向右转', .3, 0], ['向上转', 0, -.2], ['向下转', 0, .2]].map(([label, x, y]) => <button key={label} disabled={failed} onClick={() => issue({ type: 'turn', x, y })}>{label}</button>)}</div></details>
        </div>
      </div>
      <aside className="atlas-sidebar">
        {journeys.length > 0 && <label className="atlas-search">突出显示旅程<select value={journey?.id || ''} onChange={e => setJourneyId(e.target.value)}><option value="">全部记忆点</option>{journeys.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}</select></label>}
        {journey && <section className="atlas-journey" aria-label="旅程顺序"><ContentActions surface=".atlas-journey" type="journey" id={journey.id} title={journey.title}/><h4>{journey.title}</h4><p className="card-meta">青绿色光点属于这段旅程。</p><p className="globe-caption">{journey.note}</p><ol>{stops.map(stop => {
          const place = places.find(entry => entry.photos.some(p => p.id === stop.id));
          return <li key={stop.id}><ContentCommand label="编辑记忆点" run={() => onOrganize(stop)} /><ContentActions surface="li" type="memory_point" id={stop.id} title={stop.location} preview={false}/>{place ? <button data-item-open onClick={() => { choose(place); setPhotoIndex(place.photos.findIndex(p => p.id === stop.id)); }}>{stop.location || '未命名记忆点'}</button> : <span>{stop.location || '未命名记忆点'}（未定位）</span>}</li>;
        })}</ol></section>}<div className="globe-mode-switch"><button aria-pressed={explore} onClick={()=>{setExplore(true);setSelectedId(null);}}>世界地图</button><button aria-pressed={!explore} onClick={()=>setExplore(false)}>我的照片</button></div>
        {selected ? <section className="atlas-memory-card" ref={card} tabIndex={-1} aria-label={`${selected.name}的照片`}>
          <ContentActions surface=".atlas-memory-card" type="memory_point" id={shown.id} title={shown.location || selected.name} preview={false}/>
          <div className="atlas-card-heading"><span>地点记忆</span><button onClick={closeCard}>返回地点</button></div>
          {shown.photo && <button data-item-open className="atlas-photo" onClick={() => onOpenPhoto(shown, selected.photos)} aria-label={`放大${selected.name}照片`}><img key={shown.id} src={shown.photo} alt={shown.caption || selected.name} onError={event => { event.currentTarget.alt = '预览图不可用，请在照片整理中检查或恢复备份'; }} /></button>}
          <h4>{selected.name}</h4><p className="atlas-photo-date">{[shown.date, shown.time].filter(Boolean).join(' ') || '日期未知'}</p><p className="atlas-caption">{shown.caption || '这张照片还没有写下说明。'}</p>
          <p>{shown.visitStatus === 'wish' ? '想去' : '去过'}{[shown.country, shown.region, shown.city].filter(Boolean).map(name => ` · ${name}`)}</p><p className="atlas-coordinates">{selected.latitude.toFixed(4)}°, {selected.longitude.toFixed(4)}°{shown.locationSource === 'city-center' ? ' · 城市中心（近似）' : ''}</p>
          <div className="atlas-photo-nav"><button disabled={selected.photos.length < 2} onClick={() => setPhotoIndex(i => (i - 1 + selected.photos.length) % selected.photos.length)}>上一张</button><span>{photoIndex % selected.photos.length + 1} / {selected.photos.length}</span><button disabled={selected.photos.length < 2} onClick={() => setPhotoIndex(i => (i + 1) % selected.photos.length)}>下一张</button></div>
          <ContentCommand label="整理当前记忆点" run={() => onOrganize(shown)} />
        </section> : explore ? <GeographyPanel geo={geography}/> : <>
          {loading ? <p role="status">正在读取足迹…</p> : !places.length ? <div className="atlas-empty"><h4>暂无记忆</h4><button onClick={() => onOrganize()}>管理记忆点</button></div> : !results.length ? <p role="status">没有匹配的地点。</p> : <><div className="atlas-place-list">{results.slice(0, limit).map(place => <button key={place.id} onClick={() => choose(place)}><span>{place.name}</span><small>{place.photos.length} 条记忆 ↗</small></button>)}</div>{results.length > limit && <button onClick={() => setLimit(value => value + 40)}>显示更多地点（还有 {results.length - limit} 个）</button>}</>}
        </>}
      </aside>
    </div>
  </section>;
}

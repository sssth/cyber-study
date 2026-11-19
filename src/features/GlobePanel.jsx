import useContentOrder from '../ui/useContentOrder.js';
import { orderType } from '../data/contentOrder.js';
import { blocksPageBack } from '../ui/useEscapeBack.js';
import {requestGlobeBack} from '../data/globeBack.js';
import { memoryPlaces } from './globe/geo.js';
import useMapSource, {mapEntities} from '../ui/useMapSource.js';
import { getSearch, setSearch } from '../search/searchStore.js';
import { rememberView, rememberedView } from '../data/viewNavigation.js';
import { useNavigationState } from '../ui/useNavigationState.js';
import { setItemEditing } from '../data/contentOrder.js';
import { ContentCommand } from './ContentCommands.jsx';
import {useSearchCount,useSearchScope,SearchStatus,dateFilters} from '../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../search/searchCore.js';
import ContentActions from './ContentActions.jsx';
import MemoryEditor from './globe/MemoryEditor.jsx';
import { useEffect, useMemo, useRef, useState, useImperativeHandle } from 'react';
import { ActionWorkspace, FeaturePanel, EmptyState } from './ui.jsx';
import GlobeBrowser from './globe/GlobeBrowser.jsx';

const api = (action, input) => window.cyberStudy.globe(action, input);
export default function GlobePanel({ onClose, navigationItem, initialPlace, workspaceHost, initialData, initialView, projection = false, backRef }) {
  const scopeId = name => projection ? `projection:${name}` : name;
  const searchTarget = ['journey', 'memory_point'].includes(navigationItem?.type) ? navigationItem : null;
  const [photos, setPhotos] = useState(initialData?.photos || []);
  const [journeys, setJourneys] = useState(initialData?.journeys || []);
  const [editorVersion, setEditorVersion] = useState(0);
  const [initialPoint, setInitialPoint] = useState(null);
  const createReturnMode = useRef(null);
  const tripReturn = useRef(null);
  const browserViewKey = scopeId('globe.browserView');
  const globeReturnView = useRef(initialView || rememberedView(browserViewKey, null));
  const [journeyId, setJourneyId] = useNavigationState(scopeId('globe'),'journeyId','');
  const [mode, setMode] = useNavigationState(scopeId('globe'),'mode',searchTarget?.type==='journey'?'journey':searchTarget?'point':'browse', { preferInitial:Boolean(searchTarget) });
  const [viewerPhotos, setViewerPhotos] = useNavigationState(scopeId('globe'),'viewerPhotos',null, { remember:false });
  const [busy, setBusy] = useState(!initialData);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [report, setReport] = useState([]);
  const [progress, setProgress] = useState(null);
  const search=useSearchScope({id:scopeId(mode==='journey'?'journey':'globe'),label:mode==='journey'?'旅途':'记忆点',priority:projection?1010:10,searchHost:workspaceHost?()=>workspaceHost.querySelector('dialog[open]')||workspaceHost:undefined,filters:[...dateFilters,...(mode==='journey'?[]:[{key:'placeId',label:'地点',options:memoryPlaces(photos).map(p=>[p.id,p.name])},{key:'journeyId',label:'旅程',options:journeys.map(j=>[j.id,j.title])},{key:'status',label:'足迹状态',options:[['visited','去过'],['wish','想去']]}])]});
  const query=search.query;
  const [viewId, setViewId] = useNavigationState(scopeId('globe'),'viewId',null, { remember:false });
  const closeViewer = useRef(null), returnFocus = useRef(null), initialized = useRef(false);
  useEffect(() => { if (initialPlace) { setSearch(scopeId('globe'), {query:'', filters:{placeId:initialPlace.id}}); setMode('point'); return; } const current = getSearch(scopeId('globe')); if ((current.filters?.journeyId || current.filters?.placeId)) setSearch(scopeId('globe'), { ...current, filters: { ...current.filters, journeyId: '', placeId:'' } }); }, []);
  const desktop = Boolean(window.cyberStudy?.globe);
  const request = async (action, input) => {
    setBusy(true); setError(''); setMessage(''); setProgress(null);
    try {
      const result = await api(action, input);
      if (result.error) throw new Error(result.error);
      if (result.photos) setPhotos(result.photos);
      if (result.journeys) setJourneys(result.journeys);
      if (result.report) { setReport(result.report); if (!result.report.length) setMessage('没有找到可导入的照片。支持 JPEG、PNG、WebP；HEIC 取决于系统解码能力。'); }
      return result;
    } catch (err) { setError(err.message || '操作失败，请重试。'); return null; }
    finally { setBusy(false); setProgress(null); }
  };
  useEffect(() => {
    if (!desktop) { setBusy(false); return; }
    const unsubscribe = window.cyberStudy.onGlobeProgress(setProgress);
    if (!initialized.current) { initialized.current = true; if (!initialData) request('list'); }
    return unsubscribe;
  }, []);
  const active = photos.filter(p => !p.deletedAt);
  const order = useContentOrder();
  const filtered = useMemo(() => orderType(photos,'memory_point',order).filter(p => matchesItem('memory_point',p,search) && (!search.filters?.placeId || memoryPlaces([p]).some(place => place.id === search.filters.placeId)) && (!search.filters?.journeyId || journeys.find(j => j.id === search.filters.journeyId)?.pointIds.includes(p.id))), [photos, search, journeys, order]);
  useSearchCount(scopeId(mode==='journey'?'journey':'globe'),busy?null:mode==='journey'?journeys.filter(j=>matchesItem('journey',j,search)).length:filtered.length);
  const viewerSequence = (viewerPhotos || photos).filter(p => !p.deletedAt);
  const viewIndex = viewerSequence.findIndex(p => p.id === viewId), viewed = viewerSequence[viewIndex];
  useMapSource({priority:projection?1020:20,projection,detail:Boolean(viewed),pointNames:new Map(photos.map(photo=>[photo.id,photo.title || photo.location || photo.filename])),loading:busy,blocked:mode==='browse'&&!viewed,entities:viewed?mapEntities('memory_point',[viewed]):mode==='journey'?mapEntities('journey',journeys.filter(j=>matchesItem('journey',j,search))):mapEntities('memory_point',filtered)});
  const dismiss = () => { setViewId(null); setViewerPhotos(null); returnFocus.current?.focus({ preventScroll:true }); };
  useImperativeHandle(backRef, () => () => {
    if (viewed) { dismiss(); return true; }
    if (initialPoint) { setInitialPoint(null); return true; }
    if (tripReturn.current) {
      const previous = tripReturn.current; tripReturn.current = null;
      setSearch(scopeId('globe'), previous.search); setMode(previous.mode); return true;
    }
    return mode === 'browse' && requestGlobeBack();
  });
  const move = direction => { if (viewerSequence.length) setViewId(viewerSequence[(viewIndex + direction + viewerSequence.length) % viewerSequence.length].id); };
  useEffect(() => { if (viewId) closeViewer.current?.focus(); }, [viewId]);
  useEffect(() => {
    if (!viewed) return;
    const handler = event => {
      if (blocksPageBack(event) || !['Escape', 'Tab'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') dismiss();
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
      if (event.key === 'Tab') {
        const buttons = [...closeViewer.current.closest('[role="dialog"]').querySelectorAll('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement);
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  });
  useEffect(() => {
    const back = event => {
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented || viewId || initialPoint || blocksPageBack(event)) return;
      if (tripReturn.current) {
        event.preventDefault(); event.stopImmediatePropagation();
        const previous = tripReturn.current; tripReturn.current = null;
        setSearch(scopeId('globe'), previous.search); setMode(previous.mode);
      }
    };
    window.addEventListener('keydown', back, true);
    return () => window.removeEventListener('keydown', back, true);
  }, [viewId, initialPoint, setMode]);
  const editPoint = point => {
    setInitialPoint(point);
    setEditorVersion(value => value + 1);
  };
  const deletePoints = async ids => {
    if (!ids.length || !window.confirm(`删除这 ${ids.length} 个记忆点？`)) return;
    const result = await request('update', { ids, patch: { deletedAt: true } });
    if (result && !result.canceled) {
      setInitialPoint(null);
      setMessage('');
    }
  };
  useEffect(() => {
    const exit = () => setInitialPoint(null);
    window.addEventListener('cyber-exit-item-edit', exit);
    return () => window.removeEventListener('cyber-exit-item-edit', exit);
  }, []);
  useEffect(() => {
    if (!initialPoint?.id) return;
    setItemEditing(true);
    return () => setItemEditing(false);
  }, [initialPoint?.id]);
  return <FeaturePanel hasMenu wide title="地球仪" scrollContext={mode} kicker="Memory Globe" description="用照片或文字记录记忆，添加地点后即可在地球上查看。" onClose={() => { if (!busy) onClose(); }}>
    {!desktop ? <EmptyState>请通过桌面应用打开地球仪。本地照片导入需要桌面文件访问能力。</EmptyState> : <>
      <div className="globe-mode-switch" aria-label="地球仪模式">{[['browse', '3D 浏览'], ['point', '记忆点'], ['journey', '旅程']].map(([value, title]) => <button key={value} disabled={busy} aria-pressed={mode === value} onClick={() => { if (value !== mode) { setInitialPoint(null); tripReturn.current = null; const current = getSearch(scopeId('globe')); setSearch(scopeId('globe'), {...current, filters:{...current.filters, journeyId:'',placeId:''}}); setMode(value); } }}>{title}</button>)}</div>
      {mode === 'point' && initialPoint && !initialPoint.id && <ContentCommand kind="cancel-create" label="取消新建记忆点" disabled={busy} run={() => {
        setInitialPoint(null); setMode(createReturnMode.current || 'point'); createReturnMode.current = null;
      }} />}
      {mode !== 'journey' && <ContentCommand kind="create" label="新建记忆点" disabled={busy} run={() => { createReturnMode.current = mode; setMode('point'); editPoint({}); }} />}
      <SearchStatus id={mode==='journey'?'journey':'globe'} label={mode==='journey'?'旅途':'记忆点'}/>
      {busy && <p role="status">{progress ? `正在导入 ${progress.done} / ${progress.total}：${progress.name}` : '正在处理，请稍候…'}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && mode !== 'journey' && <p role="status" className="globe-caption">{message}</p>}
      {mode === 'journey' && <MemoryEditor workspaceHost={workspaceHost} initialPoint={initialPoint} key={mode} mode={mode} photos={photos} journeys={journeys} searchState={search} busy={busy} request={request} onBrowsePoints={id => { tripReturn.current = {mode, search:getSearch(scopeId('globe'))}; setSearch(scopeId('globe'), {query:'', filters:{journeyId:id}}); setInitialPoint(null); setMode('point'); }} />}
      {mode === 'browse' && <GlobeBrowser projection={projection} workspaceHost={workspaceHost} onRememberView={snapshot => { globeReturnView.current = snapshot; rememberView(browserViewKey, snapshot); }} initialView={globeReturnView.current} onBrowsePlace={(place, snapshot) => { globeReturnView.current = snapshot; tripReturn.current = {mode, search:getSearch(scopeId('globe'))}; setSearch(scopeId('globe'), {query:'', filters:{placeId:place.id}}); setInitialPoint(null); setMode('point'); }} journeys={journeys} journeyId={journeyId} setJourneyId={setJourneyId} photos={photos} loading={busy} onOrganize={photo => { setInitialPoint(photo || null); setMode('point'); }} onOpenPhoto={(photo, sequence) => { returnFocus.current = document.activeElement; setViewerPhotos(sequence); setViewId(photo.id); }} />}
      {mode === 'point' && <>
      {report.length > 0 && <details className="globe-import-report" open><summary>导入报告：{report.filter(r => r.status === '成功').length} 成功，{report.filter(r => r.status === '失败').length} 失败，{report.filter(r => !['成功', '失败'].includes(r.status)).length} 跳过</summary><ul>{report.map((r, i) => <li key={i}>{r.name} — {r.status}{r.reason ? `：${r.reason}` : ''}</li>)}</ul></details>}
      <div className="globe-library-layout memory-library-layout">
        <div className="memory-status-columns">
          {[['visited', '去过'], ['wish', '想去']].map(([status, heading]) => {
            const records = filtered.filter(p => (p.visitStatus === 'wish' ? 'wish' : 'visited') === status);
            return <section className={`memory-status-column memory-status-${status}`} key={status} aria-label={heading}>
              <h3 className="memory-status-heading">{heading}</h3>
              <div data-scroll-memory={`memory-${status}`} className={status === 'visited' ? 'memory-status-scroll globe-photo-grid' : 'memory-status-scroll memory-wish-list'}>
                {records.map(p => <article className={`admin-card memory-point-card ${status === 'wish' ? 'memory-wish-row' : 'memory-visited-card'}`} key={p.id} onClick={event => { if (initialPoint?.id && !busy && !event.target.closest('button')) editPoint(p); }}>
                  <ContentCommand label={`编辑记忆点 · ${p.title || p.location || p.filename || '未命名记忆'}`} disabled={busy} run={() => editPoint(p)} />
                  <button type="button" data-item-open className="memory-card-edit" disabled={busy} aria-label={`查看记忆：${p.title || p.location || '未命名记忆'}`} onClick={event => { returnFocus.current = event.currentTarget; setViewerPhotos(null); setViewId(p.id); }} />
                  {status === 'visited' ? <>
                    {p.thumbnail ? <img loading="lazy" className="preview-image" src={p.thumbnail} alt={p.title || p.location || '记忆照片'} /> : <div className="memory-photo-placeholder" role="img" aria-label="暂无照片"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="8" width="36" height="32" rx="4"/><circle cx="17" cy="18" r="3"/><path d="m8 35 11-11 8 8 6-6 8 9"/></svg></div>}
                    <h3>{p.title || p.location || '未命名记忆'}</h3>
                    <p className="card-meta memory-card-meta"><span>{p.city || p.location || '地点未填写'}</span><span>{p.date || '日期未知'}</span></p>
                  </> : <div className="memory-card-heading"><h3>{p.title || p.location || p.city || '未命名记忆'}</h3><span>{p.city || p.location || '城市未填写'}</span></div>}
                  <ContentActions orderItem={p} type="memory_point" id={p.id} title={p.title || p.location} preview={false}/>
                </article>)}
                {!records.length && <></>}
              </div>
            </section>;
          })}
        </div>
        <ActionWorkspace portalHost={workspaceHost} command={false} showTrigger={false} title={initialPoint?.id ? '编辑记忆点' : '新建记忆点'} open={Boolean(initialPoint)} onOpenChange={open => { if (!open) setInitialPoint(null); }}>
          {initialPoint && <MemoryEditor key={editorVersion} mode="point" initialPoint={initialPoint} photos={photos} journeys={journeys} busy={busy} request={request} onSaved={() => setInitialPoint(null)} onDelete={id => deletePoints([id])} />}
        </ActionWorkspace>
      </div>
      </>}
    </>}
    {viewed && <div className="globe-photo-viewer" role="dialog" aria-modal="true" aria-label="记忆详情">
      <ContentCommand label="编辑记忆点" run={() => { dismiss(); editPoint(viewed); }} /><ContentActions surface=".globe-photo-viewer" type="memory_point" id={viewed.id} title={viewed.location} preview={false}/>
      <button ref={closeViewer} className="memory-detail-close" aria-label="关闭记忆详情" onClick={dismiss}>×</button>
      <div data-scroll-memory={`memory-detail-${viewed.id}`} className={`memory-detail-layout ${viewed.visitStatus === 'wish' ? 'memory-detail-wish' : ''}`}>{viewed.visitStatus !== 'wish' && <div className="memory-detail-photo">{viewed.photo ? <img src={viewed.photo} alt={viewed.title || viewed.location || '记忆照片'} /> : <span>暂无照片</span>}</div>}
      <section className="memory-detail-copy">{viewed.visitStatus !== 'wish' && <><h2>{viewed.title || viewed.location || '未命名记忆'}</h2><p>{viewed.city || viewed.location || '地点未填写'} · {viewed.date || '日期未知'} · {viewed.visitStatus === 'wish' ? '想去' : '去过'}</p></>}<p className="memory-detail-description">{viewed.caption || '暂无记忆描述'}</p></section></div>
    </div>}
  </FeaturePanel>;
}

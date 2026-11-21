import { translate, translateError, translateFixedText } from '../../i18n/index.js';
import useContentOrder from '../../ui/useContentOrder.js';
import { orderType } from '../../data/contentOrder.js';
import { blocksPageBack, usePageBackMatcher } from '../../ui/useEscapeBack.js';
import {requestGlobeBack} from '../../data/globeBack.js';
import { memoryPlaces } from './geo.js';
import useResultSource, {resultEntities} from '../../results/useResultSource.js';
import { getSearch, setSearch } from '../../search/searchStore.js';
import { rememberView, rememberedView } from '../../data/viewNavigation.js';
import { useNavigationState } from '../../ui/useNavigationState.js';
import { setItemEditing } from '../../data/contentOrder.js';
import { ContentCommand } from '../ContentCommands.jsx';
import {useSearchCount,useSearchScope,SearchStatus,dateFilters} from '../../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../../search/searchCore.js';
import ContentActions from '../ContentActions.jsx';
import MemoryEditor from './MemoryEditor.jsx';
import { useEffect, useMemo, useRef, useState, useImperativeHandle } from 'react';
import { ActionWorkspace, FeaturePanel, EmptyState } from '../ui.jsx';
import GlobeBrowser from './GlobeBrowser.jsx';

const api = (action, input) => window.cyberStudy.globe(action, input);
export default function GlobePanel({ onClose, navigationItem, initialPlace, workspaceHost, initialData, initialView, projection = false, backRef }) {
  const isPageBack = usePageBackMatcher();
  const scopeId = name => projection ? `projection:${name}` : name;
  const searchTarget = ['journey', 'memory_point'].includes(navigationItem?.type) ? navigationItem : null;
  const [photos, setPhotos] = useState(initialData?.photos || []);
  useEffect(() => {
    const refresh = ({ detail }) => { setPhotos(detail.photos); setJourneys(detail.journeys); setViewerPhotos(null); };
    window.addEventListener('cyber-bulk-globe', refresh);
    return () => window.removeEventListener('cyber-bulk-globe', refresh);
  }, []);
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
  const search=useSearchScope({id:scopeId(mode==='journey'?'journey':'globe'),label:mode==='journey'?translate("i18n.trip"):translate("i18n.memoryPin"),priority:projection?1010:10,hostKey:workspaceHost,searchHost:workspaceHost?()=>workspaceHost.querySelector('dialog[open]')||workspaceHost:undefined,filters:[...dateFilters,...(mode==='journey'?[]:[{key:'placeId',label:translate("i18n.place"),options:memoryPlaces(photos).map(p=>[p.id,p.name])},{key:'journeyId',label:translate("i18n.trips"),options:journeys.map(j=>[j.id,j.title])},{key:'status',label:translate("i18n.visitStatus"),options:[['visited',translate("i18n.visited")],['wish',translate("i18n.wantToVisit")]]}])]});
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
      if (result.report) { setReport(result.report); if (!result.report.length) setMessage(translate("i18n.noPhotosFoundJpegPngAndWebp")); }
      return result;
    } catch (err) { setError(err.message || translate("i18n.actionFailedTryAgain")); return null; }
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
  useResultSource({ scopeId: mode === 'browse' ? (projection ? 'projection-geography' : 'geography') : scopeId(mode === 'journey' ? 'journey' : 'globe'), priority:projection?1020:20,projection,detail:Boolean(viewed),pointNames:new Map(photos.map(photo=>[photo.id,photo.title || photo.location || photo.filename])),loading:busy,blocked:mode==='browse'&&!viewed,matches:viewed?resultEntities('memory_point',[viewed]):mode==='journey'?resultEntities('journey',journeys.filter(j=>matchesItem('journey',j,search))):resultEntities('memory_point',filtered)});
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
      const back = isPageBack(event);
      if (blocksPageBack() || (!back && event.key !== 'Tab')) return;
      event.preventDefault(); event.stopPropagation();
      if (back) dismiss();
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
      if (!isPageBack(event) || viewId || initialPoint || blocksPageBack()) return;
      if (tripReturn.current) {
        event.preventDefault(); event.stopImmediatePropagation();
        const previous = tripReturn.current; tripReturn.current = null;
        setSearch(scopeId('globe'), previous.search); setMode(previous.mode);
      }
    };
    window.addEventListener('keydown', back, true);
    return () => window.removeEventListener('keydown', back, true);
  }, [viewId, initialPoint, setMode, isPageBack]);
  const editPoint = point => {
    setInitialPoint(point);
    setEditorVersion(value => value + 1);
  };
  const deletePoints = async ids => {
    if (!ids.length || !window.confirm(translate("i18n.deleteThese0MemoryPins", ids.length))) return;
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
  return <FeaturePanel scopeId={scopeId("globe")} hasMenu wide title="i18n.globe" scrollContext={mode} kicker="Memory Globe" description={translate("i18n.recordMemoriesWithPhotosOrNotesThen")} onClose={() => { if (!busy) onClose(); }}>
    {!desktop ? <EmptyState>{translate("i18n.openTheGlobeInTheDesktopApp")}</EmptyState> : <>
      <div className="globe-mode-switch" aria-label={translate("i18n.globeView")}>{[['browse', translate("i18n.3dView")], ['point', translate("i18n.memoryPin")], ['journey', translate("i18n.trips")]].map(([value, title]) => <button key={value} disabled={busy} aria-pressed={mode === value} onClick={() => { if (value !== mode) { setInitialPoint(null); tripReturn.current = null; const current = getSearch(scopeId('globe')); setSearch(scopeId('globe'), {...current, filters:{...current.filters, journeyId:'',placeId:''}}); setMode(value); } }}>{title}</button>)}</div>
      {mode === 'point' && initialPoint && !initialPoint.id && <ContentCommand kind="cancel-create" label={translate("i18n.cancelNewMemoryPin")} disabled={busy} run={() => {
        setInitialPoint(null); setMode(createReturnMode.current || 'point'); createReturnMode.current = null;
      }} />}
      {mode !== 'journey' && <ContentCommand kind="create" label={translate("i18n.newMemoryPin")} disabled={busy} run={() => { createReturnMode.current = mode; setMode('point'); editPoint({}); }} />}
      <SearchStatus id={mode==='journey'?'journey':'globe'} label={mode==='journey'?translate("i18n.trip"):translate("i18n.memoryPin")}/>
      {busy && <p role="status">{progress ? translate("i18n.importing012", progress.done, progress.total, progress.name) : translate("i18n.processing")}</p>}
      {error && <p className="form-error" role="alert">{translateError(error)}</p>}
      {message && mode !== 'journey' && <p role="status" className="globe-caption">{message}</p>}
      {mode === 'journey' && <MemoryEditor workspaceHost={workspaceHost} initialPoint={initialPoint} key={mode} mode={mode} photos={photos} journeys={journeys} searchState={search} busy={busy} request={request} onBrowsePoints={id => { tripReturn.current = {mode, search:getSearch(scopeId('globe'))}; setSearch(scopeId('globe'), {query:'', filters:{journeyId:id}}); setInitialPoint(null); setMode('point'); }} />}
      {mode === 'browse' && <GlobeBrowser projection={projection} workspaceHost={workspaceHost} onRememberView={snapshot => { globeReturnView.current = snapshot; rememberView(browserViewKey, snapshot); }} initialView={globeReturnView.current} onBrowsePlace={(place, snapshot) => { globeReturnView.current = snapshot; tripReturn.current = {mode, search:getSearch(scopeId('globe'))}; setSearch(scopeId('globe'), {query:'', filters:{placeId:place.id}}); setInitialPoint(null); setMode('point'); }} journeys={journeys} journeyId={journeyId} setJourneyId={setJourneyId} photos={photos} loading={busy} onOrganize={photo => { setInitialPoint(photo || null); setMode('point'); }} onOpenPhoto={(photo, sequence) => { returnFocus.current = document.activeElement; setViewerPhotos(sequence); setViewId(photo.id); }} />}
      {mode === 'point' && <>
      {report.length > 0 && <details className="globe-import-report" open><summary>{translate("i18n.photosReport",
        report.filter(r => r.status === '成功').length,
        report.filter(r => r.status === '失败').length,
        report.filter(r => !['成功', '失败'].includes(r.status)).length)}</summary><ul>{report.map((r, i) => <li key={i}>{r.name} — {translateFixedText(r.status)}{r.reason ? ` · ${translateError(r.reason)}` : ''}</li>)}</ul></details>}
      <div className="globe-library-layout memory-library-layout">
        <div className="memory-status-columns">
          {[['visited', translate("i18n.visited")], ['wish', translate("i18n.wantToVisit")]].map(([status, heading]) => {
            const records = filtered.filter(p => (p.visitStatus === 'wish' ? 'wish' : 'visited') === status);
            return <section className={`memory-status-column memory-status-${status}`} key={status} aria-label={heading}>
              <h3 className="memory-status-heading">{heading}</h3>
              <div data-scroll-memory={`memory-${status}`} className={status === 'visited' ? 'memory-status-scroll globe-photo-grid' : 'memory-status-scroll memory-wish-list'}>
                {records.map(p => <article className={`admin-card memory-point-card ${status === 'wish' ? 'memory-wish-row' : 'memory-visited-card'}`} key={p.id} onClick={event => { if (initialPoint?.id && !busy && !event.target.closest('button')) editPoint(p); }}>
                  <ContentCommand label={translate("i18n.editMemoryPin0", p.title || p.location || p.filename || translate("i18n.untitledMemory"))} disabled={busy} run={() => editPoint(p)} />
                  <button type="button" data-item-open className="memory-card-edit" disabled={busy} aria-label={translate("i18n.viewMemory0", p.title || p.location || translate("i18n.untitledMemory"))} onClick={event => { returnFocus.current = event.currentTarget; setViewerPhotos(null); setViewId(p.id); }} />
                  {status === 'visited' ? <>
                    {p.thumbnail ? <img loading="lazy" className="preview-image" src={p.thumbnail} alt={p.title || p.location || translate("i18n.memoryPhoto")} /> : <div className="memory-photo-placeholder" role="img" aria-label={translate("i18n.noPhoto")}><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="8" width="36" height="32" rx="4"/><circle cx="17" cy="18" r="3"/><path d="m8 35 11-11 8 8 6-6 8 9"/></svg></div>}
                    <h3>{p.title || p.location || translate("i18n.untitledMemory")}</h3>
                    <p className="card-meta memory-card-meta"><span>{p.city || p.location || translate("i18n.noPlaceSpecified")}</span><span>{p.date || translate("i18n.unknownDate")}</span></p>
                  </> : <div className="memory-card-heading"><h3>{p.title || p.location || p.city || translate("i18n.untitledMemory")}</h3><span>{p.city || p.location || translate("i18n.noCitySpecified")}</span></div>}
                  <ContentActions orderItem={p} type="memory_point" id={p.id} title={p.title || p.location} preview={false}/>
                </article>)}
                {!records.length && <></>}
              </div>
            </section>;
          })}
        </div>
        <ActionWorkspace portalHost={workspaceHost} command={false} showTrigger={false} kind={initialPoint?.id ? "edit" : "create"} title={initialPoint?.id ? translate("i18n.editMemoryPin") : translate("i18n.newMemoryPin")} open={Boolean(initialPoint)} onOpenChange={open => { if (!open) setInitialPoint(null); }}>
          {initialPoint && <MemoryEditor key={editorVersion} mode="point" initialPoint={initialPoint} photos={photos} journeys={journeys} busy={busy} request={request} onSaved={() => setInitialPoint(null)} onDelete={id => deletePoints([id])} />}
        </ActionWorkspace>
      </div>
      </>}
    </>}
    {viewed && <div className="globe-photo-viewer" role="dialog" aria-modal="true" aria-label={translate("i18n.memoryDetails")}>
      <ContentCommand label={translate("i18n.editMemoryPin")} run={() => { dismiss(); editPoint(viewed); }} /><ContentActions surface=".globe-photo-viewer" type="memory_point" id={viewed.id} title={viewed.location} preview={false}/>
      <button ref={closeViewer} className="memory-detail-close" aria-label={translate("i18n.closeMemoryDetails")} onClick={dismiss}>×</button>
      <div data-scroll-memory={`memory-detail-${viewed.id}`} className={`memory-detail-layout ${viewed.visitStatus === 'wish' ? 'memory-detail-wish' : ''}`}>{viewed.visitStatus !== 'wish' && <div className="memory-detail-photo">{viewed.photo ? <img src={viewed.photo} alt={viewed.title || viewed.location || translate("i18n.memoryPhoto")} /> : <span>{translate("i18n.noPhoto")}</span>}</div>}
      <section className="memory-detail-copy">{viewed.visitStatus !== 'wish' && <><h2>{viewed.title || viewed.location || translate("i18n.untitledMemory")}</h2><p>{viewed.city || viewed.location || translate("i18n.noPlaceSpecified")} · {viewed.date || translate("i18n.unknownDate")} · {viewed.visitStatus === 'wish' ? translate("i18n.wantToVisit") : translate("i18n.visited")}</p></>}<p className="memory-detail-description">{viewed.caption || translate("i18n.noDescriptionYet")}</p></section></div>
    </div>}
  </FeaturePanel>;
}

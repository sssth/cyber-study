import { translate } from '../../i18n/index.js';
import { toggleEditor, editActivationProps } from '../../ui/editGesture.js';
import useEscapeBack, { blocksPageBack, usePageBackMatcher } from '../../ui/useEscapeBack.js';
import { filterGlobeMemories } from './filterMemories.js';
import { useSearchCount } from '../../search/useSearchScope.jsx';
import { matchesItem, textMatches } from '../../search/searchCore.js';
import { useNavigationState } from '../../ui/useNavigationState.js';
import { ActionWorkspace } from '../ui.jsx';
import ModelLoading from '../../ui/ModelLoading.jsx';
import { ContentCommand } from '../ContentCommands.jsx';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useGeography from './useGeography.jsx';
import { nodeById } from './geography.js';
import { memoryPlaces } from './geo.js';
import '../../styles/globe.css';
const GlobeScene = lazy(() => import('./GlobeScene.jsx'));

export default function GlobeBrowser({ photos, loading, initialView, onRememberView, onBrowsePlace, onOrganize, onOpenPhoto, journeys = [], journeyId, setJourneyId, projection = false, workspaceHost }) {
  const isPageBack = usePageBackMatcher();
  const [controlsOpen, setControlsOpen] = useState(false);
  const [selectedId, setSelectedId] = useNavigationState(projection?'projection':'globe','selectedId',null), [photoIndex, setPhotoIndex] = useNavigationState(projection?'projection':'globe','photoIndex',0);
  const livePointIds = useMemo(() => new Set(photos.filter(p => !p.deletedAt).map(p => p.id)), [photos]);
  const journeyPoints = journey => (journey.pointIds || []).filter(id => livePointIds.has(id));
  const [selectedPoints, setSelectedPoints] = useState(() => [...new Set(initialView?.selectedPoints ?? photos.filter(p => !p.deletedAt).map(p => p.id))]);
  const selectionInitialized = useRef(initialView?.selectedPoints !== undefined || !loading);
  useEffect(() => {
    if (!selectionInitialized.current && !loading) {
      selectionInitialized.current = true;
      setSelectedPoints(photos.filter(p => !p.deletedAt).map(p => p.id));
    }
  }, [loading, photos]);
  // Journey checkboxes reflect the same point selection, rather than a second highlight layer.
  const selectedJourneys = journeys.filter(j => { const ids = journeyPoints(j); return ids.length > 0 && ids.every(id => selectedPoints.includes(id)); }).map(j => j.id);
  const appliedJourney = useRef(initialView?.selectedPoints ? journeyId : null);
  useEffect(() => {
    const journey = journeys.find(j => j.id === journeyId);
    if (!journeyId) { appliedJourney.current = null; return; }
    if (!journey || appliedJourney.current === journeyId) return;
    appliedJourney.current = journeyId;
    setSelectedPoints(ids => [...new Set([...ids, ...journeyPoints(journey)])]);
  }, [journeyId, journeys, livePointIds]);
  const [rotating, setRotating] = useState(false), [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [command, setCommand] = useNavigationState(projection?'projection':'globe','command',null,{ remember:false }), [failed, setFailed] = useState(false), [ready, setReady] = useState(false), [retry, setRetry] = useState(0);
  const search = useRef(), card = useRef(), returnTarget = useRef();
  const journey = journeys.find(j => j.id === journeyId);
  const stops = journey?.pointIds.map(id => photos.find(p => p.id === id && !p.deletedAt)).filter(Boolean) ?? [];
  const issue = useCallback(values => { setRotating(false); setCommand({ ...values, serial: performance.now() }); }, []);
  const cameraPosition = useRef(initialView?.position || null);
  const geography = useGeography(issue, true, projection?'projection-geography':'geography', initialView, cameraPosition, workspaceHost);
  const regionGeometry = geography.region?.geometry || (geography.region?.kind === 'country' ? geography.worldFeatures : geography.features).find(n => n.id === geography.region?.id)?.geometry;
  const { visiblePhotos, visibleJourneys } = useMemo(() => filterGlobeMemories(photos, journeys, geography.search, geography.region, regionGeometry), [photos, journeys, geography.search, geography.region, regionGeometry]);
  const places = useMemo(() => memoryPlaces(visiblePhotos), [visiblePhotos]);
  const highlighted = useMemo(() => new Set(visiblePhotos.filter(p => selectedPoints.includes(p.id)).map(p => p.id)), [visiblePhotos, selectedPoints]);
  const selected = places.find(place => place.id === selectedId);
  useSearchCount('geography', loading ? null : visiblePhotos.length);
  const rememberBrowser = useRef(null);
  rememberBrowser.current = () => onRememberView?.({
    position: cameraPosition.current, region: geography.region, city: geography.city,
    history: geography.history, selectedPoints, selectedJourneys,
  });
  useEffect(() => {
    rememberBrowser.current();
    return () => rememberBrowser.current();
  }, []);
  const choose = useCallback((place, cameraView) => { if (onBrowsePlace) { setControlsOpen(false); onBrowsePlace(place, { ...cameraView, region:geography.region, city:geography.city, history:geography.history, selectedPoints, selectedJourneys }); return; } returnTarget.current = document.activeElement; setSelectedId(place.id); setPhotoIndex(0); issue({ type: 'place', place }); }, [issue, onBrowsePlace, geography.region, geography.city, geography.history, selectedPoints, selectedJourneys]);
  const closeCard = useCallback(() => { setSelectedId(null); returnTarget.current?.focus?.(); }, []);
  const readyScene = useCallback(() => setReady(true), []), failScene = useCallback(() => { setFailed(true); setReady(false); }, []), stopRotation = useCallback(() => setRotating(false), []);
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => { setReduced(media.matches); if (media.matches) setRotating(false); }; media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  useEffect(() => { if (selectedId) card.current?.focus(); }, [selectedId]);
  useEffect(() => { if (reduced) setRotating(false); }, [reduced]);
  useEffect(() => { const pause = () => { if (document.hidden) setRotating(false); }; document.addEventListener('visibilitychange', pause); return () => document.removeEventListener('visibilitychange', pause); }, []);
  useEffect(() => {
    const localBack = event => {
      const modal = [...document.querySelectorAll('dialog:modal')].at(-1);
      if (modal && modal !== workspaceHost) return;
      if (!event.defaultPrevented && geography.back()) { event.preventDefault(); setSelectedId(null); }
    };
    window.addEventListener('cyber-globe-back', localBack);
    return () => window.removeEventListener('cyber-globe-back', localBack);
  }, [geography.back]);
  useEscapeBack(() => {
    if (!geography.back()) return false;
    setSelectedId(null);
  }, {
    capture: true, stop: true,
    blocked: blocksPageBack
  });
  const onKeys = event => {
    if (event.isComposing || event.target.matches('input, textarea') || event.target.closest('.globe-photo-viewer')) return;
    if (isPageBack(event)) {
      if (selected) { event.preventDefault(); event.stopPropagation(); closeCard(); }
      return;
    }
    if (selected && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setPhotoIndex(i => (i + (event.key === 'ArrowRight' ? 1 : -1) + selected.photos.length) % selected.photos.length); }
  };
  return <section className="memory-atlas" data-visible-memory-ids={visiblePhotos.map(p=>p.id).join(",")} data-reduced-motion={reduced} data-highlight-ids={[...highlighted].join(",")} aria-label={translate("i18n.3dMemoryGlobe")} onKeyDown={onKeys}>
    <div className="atlas-heading"><div><p className="atlas-eyebrow">{translate("i18n.myTravels")}</p><h3>{translate("i18n.revisitThePlacesYouRemember")}</h3></div><span>{places.length}{' '}{translate("i18n.places")}{' '}{places.reduce((sum, p) => sum + p.photos.length, 0)}{' '}{translate("i18n.memories")}</span></div>

    <div className="atlas-layout">
      <div className="atlas-stage" data-edit-item tabIndex={0} aria-label={translate("i18n.rotatable3dGlobeDoubleClickForControls")} {...editActivationProps(() => toggleEditor(setControlsOpen))} onKeyDown={e => { if (e.target === e.currentTarget && e.key === 'Enter' && !isPageBack(e)) setControlsOpen(true); }}>
        <ContentCommand label={translate("i18n.editGlobeView")} run={() => setControlsOpen(true)} />
        {!failed && <Suspense fallback={null}><GlobeScene cameraPosition={cameraPosition} initialView={initialView} highlighted={highlighted} geography={geography} key={retry} places={places} selected={null} onSelect={choose} command={command} rotating={rotating} reduced={reduced} onInteract={stopRotation} onReady={readyScene} onFailure={failScene} /></Suspense>}
        {!ready && !failed && <ModelLoading />}
        {failed && <div className="atlas-fallback" role="alert"><h4>{translate("i18n.3dGlobeUnavailable")}</h4><p>{translate("i18n.browsePhotosInThePlaceListOn")}</p><button onClick={() => { setFailed(false); setRetry(i => i + 1); }}>{translate("i18n.retry3d")}</button></div>}


      </div>

    </div>
    <ActionWorkspace portalHost={workspaceHost} scrollMemoryKey={projection ? "projection.globe.options" : "globe.options"} kind="edit" title={translate("i18n.editGlobe")} open={controlsOpen} onOpenChange={setControlsOpen} command={false} showTrigger={false}>
      <div className="globe-control-workspace">
    <nav className="atlas-breadcrumbs" aria-label={translate("i18n.geographicLevel")}><button onClick={()=>{setSelectedId(null);geography.navigate(null);}}>{translate("i18n.world")}</button>{geography.region?.parent_id && <><span>／</span><button onClick={()=>geography.navigate(nodeById.get(geography.region.parent_id))}>{nodeById.get(geography.region.parent_id)?.name}</button></>}{geography.region&&<><span>／</span><button onClick={()=>geography.navigate(geography.region)}>{geography.region.name}</button></>}{geography.city&&<span>／{geography.city.name}</span>}</nav>        <div className="atlas-controls" aria-label={translate("i18n.globeControls")}>
          <button disabled={failed} onClick={() => issue({ type: 'zoom', factor: .8 })} aria-label={translate("i18n.zoomIn2")}>＋</button><button disabled={failed} onClick={() => issue({ type: 'zoom', factor: 1.25 })} aria-label={translate("i18n.zoomOut2")}>−</button>
          <button disabled={failed} onClick={() => { closeCard(); geography.navigate(null); }}>{translate("i18n.globalView")}</button>
          <button disabled={failed || reduced} aria-pressed={rotating} onClick={() => setRotating(value => !value)}>{rotating ? translate("i18n.stopRotation") : translate("i18n.autoRotate")}</button>

        </div>
        <div className="globe-selector-sections">
          <fieldset className="music-create-song-picker"><legend>{translate("i18n.region")}</legend>
            {geography.error && <p role="alert">{geography.error}<button onClick={geography.retry}>{translate("i18n.retry")}</button></p>}
            <div data-scroll-memory={`regions-${geography.region?.id ?? 'world'}`} className="music-create-song-options globe-region-options">{geography.results.map(n => <button key={n.id} type="button" aria-pressed={(geography.city?.id || geography.region?.id) === n.id} onClick={() => { setSelectedId(null); n.resultType === 'city' ? geography.chooseCity(n) : geography.navigate(n); }}>{n.name}</button>)}</div>
          </fieldset>
          <fieldset className="music-create-song-picker"><legend>{translate("i18n.memoryPin")}</legend>
            <div data-scroll-memory="points" className="music-create-song-options">{visiblePhotos.map(p => <label key={p.id}><input type="checkbox" checked={selectedPoints.includes(p.id)} onChange={e => { const checked=e.target.checked; setSelectedId(null); setSelectedPoints(ids => checked ? [...ids,p.id] : ids.filter(id => id !== p.id)); }} /><span>{p.title || p.location || translate("i18n.untitledMemory")}{p.title && p.location ? ` · ${p.location}` : ''}</span></label>)}</div>
          </fieldset>
          <fieldset className="music-create-song-picker"><legend>{translate("i18n.trip")}</legend>
            <div data-scroll-memory="journeys" className="music-create-song-options">{visibleJourneys.map(j => <label key={j.id}><input type="checkbox" checked={selectedJourneys.includes(j.id)} onChange={e => { const checked=e.target.checked; setSelectedId(null); if(journeyId === j.id) setJourneyId(''); const points = journeyPoints(j); setSelectedPoints(ids => checked ? [...new Set([...ids, ...points])] : ids.filter(id => !points.includes(id))); }} /><span>{j.title}</span></label>)}</div>
          </fieldset>
        </div>
      </div>
    </ActionWorkspace>
  </section>;
}

import ImageFileField from '../ImageFileField.jsx';
import ParentMembershipPicker from '../../ui/ParentMembershipPicker.jsx';
import OrderedMemberPicker from '../../ui/OrderedMemberPicker.jsx';
import PhotoCrop, { useFilePreview } from '../PhotoCrop.jsx';
import EntityTagsField from '../../entities/EntityTagsField.jsx';
import { translate, translateError } from '../../i18n/index.js';
import useContentOrder from '../../ui/useContentOrder.js';
import { orderType } from '../../data/contentOrder.js';
import { WorkspaceActions, WorkspaceFields } from '../ui.jsx';
import { ContentCommand, ContentEditButton } from '../ContentCommands.jsx';
import { ActionWorkspace } from '../ui.jsx';
import {useSearchScope,SearchStatus,dateFilters} from '../../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../../search/searchCore.js';
import ContentActions from '../ContentActions.jsx';
import { useState } from 'react';
import { loadCities, nodeById } from './geography.js';

const blank = { title: '', location: '', text: '', date: '', time: '', country: '', region: '', city: '', cityId: '', latitude: '', longitude: '', visitStatus: 'wish' };
const label = p => p.title || p.location || p.filename || p.text?.slice(0, 40) || translate("i18n.untitledMemoryPin");

export default function MemoryEditor({ mode, photos, journeys = [], editJourney, onClose, error, busy, request, onBrowsePoints, initialPoint, onSaved, onDelete, searchState, workspaceHost }) {
  const order = useContentOrder();
  const [point, setPoint] = useState(() => ({ ...blank, ...initialPoint }));
  const [photoFile, setPhotoFile] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [readingPhoto, setReadingPhoto] = useState(false);
  const preview = useFilePreview(photoFile) || point.photo || point.thumbnail;
  const [journey, setJourney] = useState(editJourney || { title: '', text: '', pointIds: [] });
  const [originalJourneys] = useState(()=>journeys.filter(j=>j.pointIds?.includes(initialPoint?.id)).map(j=>j.id));
  const [selectedJourneys,setSelectedJourneys] = useState(originalJourneys);
  const [cities, setCities] = useState([]);
  const [query, setQuery] = useState(initialPoint?.city || initialPoint?.location || '');
  const [searching, setSearching] = useState(false);
  const [cityError, setCityError] = useState('');
  const [citiesLoading, setCitiesLoading] = useState(false);
  const fetchCities = async () => {
    if (cities.length || citiesLoading) return;
    setCitiesLoading(true); setCityError('');
    try { setCities(await loadCities()); }
    catch { setCityError(translate("i18n.theCityListIsUnavailableClickThe")); }
    finally { setCitiesLoading(false); }
  };
  const [remove, setRemove] = useState(false);
  const active = photos.filter(p => !p.deletedAt);
  const byId = new Map(photos.map(p => [p.id, p]));
  const set = (key, value) => setPoint(p => ({ ...p, [key]: value, ...(['latitude', 'longitude', 'city', 'region', 'country'].includes(key) ? { cityId: '' } : {}) }));
  const savePoint = async () => {
    if (busy || readingPhoto) return;
    setPhotoError('');
    setReadingPhoto(true);
    try {
      const coordinate = value => String(value ?? '').trim() === '' ? null : Number(value);
      const result = await request('point', { ...point, photoBytes: photoFile ? new Uint8Array(await photoFile.arrayBuffer()) : undefined,
        addJourneys:selectedJourneys.filter(id=>!originalJourneys.includes(id)),
        removeJourneys:originalJourneys.filter(id=>!selectedJourneys.includes(id)),
        latitude: coordinate(point.latitude), longitude: coordinate(point.longitude) });
      if (result && !result.canceled) {
        if (onSaved) { onSaved(result.photos?.find(p=>!photos.some(old=>old.id===p.id)) || result.photos?.find(p=>p.id===point.id)); }
        else { setPoint(blank); setQuery(''); setPhotoFile(null); }
      }
    } catch (failure) {
      setPhotoError(failure.message);
    } finally {
      setReadingPhoto(false);
    }
  };
  const candidates = active.filter(p => matchesItem('memory_point', p, searchState));
  const [journeyEditorOpen, setOpen] = useState(Boolean(editJourney));
  const setJourneyEditorOpen = open => {setOpen(open); if (!open && editJourney) onClose();};
  if (mode === 'journey') { const editor = (<ActionWorkspace kind={journey.id ? "edit" : "create"} portalHost={workspaceHost} disabled={busy} onCreate={() => { setRemove(false); setJourney({ title: '', text: '', pointIds: [] }); }} label={translate("i18n.newTrip")} title={journey.id ? translate("i18n.editTrip") : translate("i18n.newTrip")} open={journeyEditorOpen} onOpenChange={setJourneyEditorOpen}><form className="stack-form" onSubmit={async e => { e.preventDefault(); if (await request('journey', journey)) setJourneyEditorOpen(false); }}>
      <WorkspaceFields><EntityTagsField type="journey" item={journey}/>
        {error && <p role="alert">{translateError(error)}</p>}
        <h3>{journey.id ? translate("i18n.editTrip") : translate("i18n.newTrip")}</h3>
        <label>{translate("i18n.tripName")}<input required maxLength={200} value={journey.title} onChange={e => setJourney({ ...journey, title: e.target.value })} /></label>
        <label>{translate("i18n.tripDescription")}<textarea value={journey.text} onChange={e => setJourney({ ...journey, text: e.target.value })} /></label>
        <label>{translate("i18n.startDate")}<input type="date" value={journey.startDate||''} onChange={e=>setJourney({...journey,startDate:e.target.value})}/></label><label>{translate("i18n.endDate")}<input type="date" value={journey.endDate||''} onChange={e=>setJourney({...journey,endDate:e.target.value})}/></label>
        <OrderedMemberPicker legend={translate("i18n.addMemoryPin")} disabled={busy}
          candidates={candidates} selectedIds={journey.pointIds}
          updateIds={update => setJourney(current => ({ ...current, pointIds: update(current.pointIds) }))}
          optionLabel={p => [label(p), p.title && p.location, p.date].filter(Boolean).join(' · ')}
          memberTitle={id => label(byId.get(id) || {})}
          memberDetail={id => byId.get(id)?.city || byId.get(id)?.location || ''}
          confirmRemoval={translate("i18n.removeThisPinFromTheTripThe")} />
      </WorkspaceFields>
      <WorkspaceActions>{journey.id && remove ? <>
        <button type="button" disabled={busy} onClick={event => { event.preventDefault(); setRemove(false); }}>{translate("i18n.cancel")}</button>
        <button type="button" disabled={busy} onClick={async () => {
          const result = await request('journey', { id: journey.id, remove: true });
          if (!result || result.canceled) return;
          setRemove(false);
          setJourney({ title: '', text: '', pointIds: [] });
          setJourneyEditorOpen(false);
        }}>{translate("i18n.deleteTrip")}</button>
      </> : <>
        <button disabled={busy}>{translate("i18n.save")}</button>
        {journey.id && <ContentEditButton label={translate("i18n.delete")} disabled={busy} run={() => setRemove(true)} />}
      </>}</WorkspaceActions>
    </form></ActionWorkspace>);
  if (editJourney) return editor;
  return <div className="globe-library-layout journey-library-layout">
    <section className="journey-card-grid" data-scroll-memory="journeys">

      {orderType(journeys,'journey',order).filter(j=>matchesItem('journey',j,searchState)).map(j => <article key={j.id} className="admin-card journey-summary-card" onClick={event => { if (journeyEditorOpen && !busy && !event.target.closest('button')) { setRemove(false); setJourney(j); } }}>
        <ContentActions orderItem={j} type="journey" id={j.id} title={j.title} preview={false}/><div className="journey-summary-content"><div className="journey-summary-heading"><h3>{j.title}</h3><span>{j.pointIds.length}{' '}{translate("i18n.memoryPins")}</span></div>
          {(j.startDate || j.endDate) && <p className="journey-summary-dates">{j.startDate || translate("i18n.tbd")} — {j.endDate || translate("i18n.tbd")}</p>}
          </div>
        <button type="button" data-item-open className="memory-card-edit" disabled={busy} aria-label={translate("i18n.viewTrip0", j.title)} onClick={() => onBrowsePoints?.(j.id)} />
        <div className="globe-toolbar"><ContentCommand label={translate("i18n.editTrip0", j.title)} disabled={busy} run={() => { setJourneyEditorOpen(true); setRemove(false); setJourney(j); }} /></div>
      </article>)}
    </section>
    {editor}
  </div>;
  }
  const search = searching ? query.trim().toLowerCase() : '';
  const matches = search ? cities.filter(c => [c.name, c.name_ascii, c.aliases].some(name => name?.toLowerCase().includes(search))).slice(0, 10) : [];
  return <form className="stack-form memory-point-form" onSubmit={e => { e.preventDefault(); savePoint(); }}>
    <WorkspaceFields><EntityTagsField type="memory_point" item={point}/>
      {!point.id && <div className="globe-toolbar"><button type="button" disabled={busy} onClick={() => request('import', { folder: false })}>{translate("i18n.importPhotos")}</button><button type="button" disabled={busy} onClick={() => request('import', { folder: true })}>{translate("i18n.importFolder")}</button></div>}
      <h3>{point.id ? translate("i18n.editMemoryPin") : translate("i18n.newMemoryPin")}</h3>
      <label>{translate("i18n.memoryName")}<input maxLength={200} value={point.title || ''} onChange={e => set('title', e.target.value)} placeholder={translate("i18n.giveThisMemoryAName")} /></label>
      <label>{translate("i18n.searchOfflineCities")}<input value={query} onFocus={fetchCities} onChange={e => { setQuery(e.target.value); setSearching(true); }} /></label>
      {cityError && <p role="alert">{translateError(cityError)}</p>}
      {citiesLoading && <p role="status">{translate("i18n.loadingCities")}</p>}

      <div className="globe-toolbar" hidden={!matches.length}>{matches.map(c => <button key={c.id} type="button" onClick={() => {
        setPoint({ ...point, location: c.name, city: c.name, cityId: c.id, country: nodeById.get(c.country_id)?.name || '', region: nodeById.get(c.region_id)?.name || '', latitude: c.latitude, longitude: c.longitude }); setQuery(c.name); setSearching(false);
      }}>{c.name} · {[nodeById.get(c.country_id)?.name, nodeById.get(c.region_id)?.name].filter(Boolean).join(' / ')}</button>)}</div>
      <label>{translate("i18n.memoryNotes")}<textarea value={point.text} onChange={e => set('text', e.target.value)} /></label>
      <label>{translate("i18n.visitStatus2")}<select value={point.visitStatus} onChange={e => set('visitStatus', e.target.value)}><option value="visited">{translate("i18n.visited")}</option><option value="wish">{translate("i18n.wantToVisit")}</option></select></label>
      <label>{translate("i18n.date")}<input type="date" value={point.date || ''} onChange={e => set('date', e.target.value)} /></label>
      <ImageFileField label={translate("i18n.nativePhotos")} accept=".jpg,.jpeg,.png,.webp,.heic,.heif"
        disabled={busy || readingPhoto} onChange={event => {
          const file = event.target.files[0];
          if (!file) return;
          if (file.size > 80 * 1024 * 1024) {
            event.target.value = '';
            setPhotoError(translate("i18n.chooseAPhotoNoLargerThanMb"));
            return;
          }
          setPhotoError('');
          setPhotoFile(file);
          set('photoCrop', null);
        }}>
        {preview && <PhotoCrop src={preview} ratio={1.5} value={point.photoCrop} onChange={v=>set("photoCrop",v)} />}
      </ImageFileField>
      {photoError && <p role="alert">{translateError(photoError)}</p>}

      {point.id && <ParentMembershipPicker type="journey" parents={journeys} workspaceHost={workspaceHost}
        selectedIds={selectedJourneys} updateIds={setSelectedJourneys} disabled={busy}/>}
      {(point.country || point.region || point.city || point.location) && <div className="workspace-property"><span>{translate("i18n.selectedPlace")}</span><span>{[point.country, point.region, point.city || point.location].filter(Boolean).join(' / ')}</span></div>}
    </WorkspaceFields>
    <WorkspaceActions><button disabled={busy || readingPhoto}>{translate("i18n.save")}</button>{point.id && onDelete && <ContentEditButton label={translate("i18n.delete")} disabled={busy} run={() => onDelete(point.id)} />}</WorkspaceActions>
  </form>;
}

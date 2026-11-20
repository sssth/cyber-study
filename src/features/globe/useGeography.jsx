import { translate } from '../../i18n/index.js';
import { useNavigationState } from '../../ui/useNavigationState.js';
import {setSearch} from '../../search/searchStore.js';
import {useSearchCount,useSearchScope,SearchStatus,dateFilters} from '../../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../../search/searchCore.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { catalog, loadCities, loadRegions, nodeById, regionView } from './geography.js';
const administrativeLabels = {prefecture_city:'地级市',autonomous_prefecture:'自治州',prefecture:'地区',league:'盟',municipality:'直辖市',admin2:'二级行政区'};
const parentName = city => city.source_admin1_name || nodeById.get(city.region_id)?.name;
const cityLabel = city => administrativeLabels[city.admin_type] || translate("i18n.findACity");
export default function useGeography(issue, enabled=true, scope='geography', initialView, cameraPosition, workspaceHost) {
  const [region, setRegion] = useNavigationState(scope,'region',initialView?.region || null), [city, setCity] = useNavigationState(scope,'city',initialView?.city || null), [features, setFeatures] = useState([]), [cities, setCities] = useState([]);
  const history = useRef(initialView?.history || []);
  const remember = () => { history.current = [...history.current, { region, city, position: cameraPosition?.current ? [...cameraPosition.current] : null }]; };
  const back = () => {
    const previous = history.current.at(-1);
    if (!previous) return false;
    history.current = history.current.slice(0, -1);
    setRegion(previous.region); setCity(previous.city); setLimit(40);
    issue(previous.position ? {type:'restore', position:previous.position} : previous.region ? {type:'region',place:regionView(previous.region)} : {type:'home'});
    return true;
  };
  const [worldFeatures,setWorldFeatures]=useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(()=>{let active=true;loadRegions(null).then(rows=>{if(active)setWorldFeatures(rows)}).catch(()=>{});return()=>{active=false}},[revision]);
  const search=useSearchScope({id:scope,label:translate("i18n.memoryPin"),priority:scope.startsWith('projection')?1020:20,hostKey:workspaceHost,searchHost:workspaceHost?()=>workspaceHost.querySelector('dialog[open]')||workspaceHost:undefined,enabled,exactCount:true,filters:[{key:'searchBy',label:translate("i18n.searchBy2"),defaultLabel:translate("i18n.byMemoryPin"),options:[['',translate("i18n.byMemoryPin")],['journey',translate("i18n.byTrip")]]}]});
  const query=search.query;const setQuery=query=>setSearch(scope,{query,filters:{}});const [limit,setLimit]=useState(40);
  useEffect(() => { let active = true; loadCities().then(rows => { if (active) setCities(rows); }).catch(() => { if(active) setError(translate("i18n.couldNotLoadCitiesTryAgain")); }); return () => { active = false; }; }, [revision]);
  useEffect(() => {
    let active = true; setBusy(true); setError(''); setFeatures([]);
    const countryId = region?.kind === 'country' ? region.id : region?.parent_id;
    loadRegions(countryId).then(async rows => { if(region?.kind === 'country' && !rows.length) rows = (await loadRegions(null)).filter(row=>row.id===region.id); return rows; }).then(rows => { if(active) { setFeatures(region?.kind === 'region' ? rows.filter(row => row.id === region.id) : rows); setBusy(false); } }).catch(() => { if(active) { setError(translate("i18n.couldNotLoadTheRegionalMapTry")); setBusy(false); } });
    return () => { active = false; };
  }, [region, revision]);
  const navigate = useCallback(node => { if (node?.id !== region?.id || city) remember(); setRegion(node); setCity(null); setLimit(40); issue(node ? { type: 'region', place: regionView(node) } : { type: 'home' }); }, [issue, region, city]);
  const chooseCity = useCallback(item => { if (city?.id !== item.id) remember(); const owner = nodeById.get(item.region_id) || nodeById.get(item.country_id); setRegion(owner || null); setCity(item); setLimit(40); issue({ type: 'region', place: { ...item, distance: 1.065 } }); }, [issue, region, city]);
  const visibleCities = useMemo(() => city ? [city] : [], [city]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return [...catalog.filter(n => n.name.includes(q) || (n.id==='country:CHN' && '中国'.includes(q)) || (n.name_en || '').toLowerCase().includes(q)).map(n => ({...n,resultType:'region'})), ...cities.filter(c => c.name.toLowerCase().includes(q) || c.name_ascii.toLowerCase().includes(q) || c.aliases.toLowerCase().includes(q)).map(c => ({...c,resultType:'city'}))];
    return catalog.filter(n => n.parent_id === (region?.id || null)).map(n => ({...n,resultType:'region'}));
  }, [query, cities,region]);
  return { search, back, history:history.current, region, city, worldFeatures, features, visibleCities, busy, error, retry:()=>setRevision(v=>v+1), navigate, chooseCity, query, setQuery:value=>{setQuery(value);setLimit(40);}, results,limit,more:()=>setLimit(v=>v+40) };
}
export function GeographyPanel({ geo }) {
  return <div className="atlas-geography-panel">
    {geo.busy&&<p role="status">{translate("i18n.loadingRegionalBoundaries")}</p>}
    {geo.error&&<p role="alert">{geo.error}<button onClick={geo.retry}>{translate("i18n.retryMap")}</button></p>}
    {geo.city&&<div className="atlas-city-detail"><h4>{geo.city.name}</h4><p>{[nodeById.get(geo.city.country_id)?.name,parentName(geo.city)].filter(Boolean).join(' / ')}</p><p>{geo.city.latitude.toFixed(4)}°, {geo.city.longitude.toFixed(4)}°</p><small>{cityLabel(geo.city)}{geo.city.admin_code ? ` · ${geo.city.admin_code}` : ''}{geo.city.admin_type==='admin2'&&<><br/>{translate("i18n.locationReference")}{geo.city.reference_name}<br/>{translate("i18n.theAdministrativeRegionAndReferenceLocationMay")}</>}<br/>{translate("i18n.regionalReferencePoint")}</small></div>}
    <SearchStatus id="geography" label={translate("i18n.geographicDirectory")}/>
    <p className="atlas-list-caption">{geo.query?translate("i18n.0Results2", geo.results.length):geo.region?`${geo.region.name} · ${geo.results.length?translate("i18n.nextLevel"):translate("i18n.browseRegions")}`:translate("i18n.selectACountryToExploreItsRegions")}</p>
    <div className="atlas-place-list">{geo.results.slice(0,geo.limit).map(n=><button key={n.id} onClick={()=>n.resultType==='city'?geo.chooseCity(n):geo.navigate(n)}><span>{n.name}<small className="atlas-result-parent">{n.resultType==='city'?[nodeById.get(n.country_id)?.name,parentName(n)].filter(Boolean).join(' / '):nodeById.get(n.parent_id)?.name}</small></span><small>{n.resultType==='city'?cityLabel(n):n.kind==='country'?translate("i18n.countryOrRegion"):translate("i18n.provinceOrRegion")} ↗</small></button>)}</div>

    {geo.results.length>geo.limit&&<button onClick={geo.more}>{translate("i18n.showMore2")}{' '}{geo.results.length-geo.limit}{' '}{translate("i18n.remaining")}</button>}
    <SearchStatus id="geography" label={translate("i18n.geographicDirectory")}/>
    <p className="atlas-list-caption">{translate("i18n.warmPinsPhotosBluePinSelectedReference")}<br/>{translate("i18n.offlineMapsAndPlaceNamesNaturalEarth")}</p>
  </div>;
}

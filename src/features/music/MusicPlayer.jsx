import PhotoCrop, { cropStyle, useFilePreview } from '../PhotoCrop.jsx';
import { entityTags } from '../../entities/tags.js';
import EntityTagsField from '../../entities/EntityTagsField.jsx';
import useActivityTime from '../../ui/useActivityTime.js';
import { removeEntityRelations } from '../../entities/contentRelations.js';
import { translate, translateError } from '../../i18n/index.js';
import RecordShelf from './RecordShelf.jsx';
import useContentOrder from '../../ui/useContentOrder.js';
import { orderType } from '../../data/contentOrder.js';
import { toggleEditor, editActivationProps } from '../../ui/editGesture.js';
import useResultSource, {resultEntities} from '../../results/useResultSource.js';
import '../../../shared/contentAssets.js';
import { hasRestoredView } from '../../data/viewNavigation.js';
import { useNavigationState } from '../../ui/useNavigationState.js';
import { WorkspaceActions, WorkspaceFields } from '../ui.jsx';
import { ContentCommand } from '../ContentCommands.jsx';
import {useSearchCount,useSearchScope,SearchStatus} from '../../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../../search/searchCore.js';
import ContentActions from '../ContentActions.jsx';
import { useEffect, useRef, useState } from 'react';
import { MusicSources, musicPlatformNames, musicRequest } from './MusicSources.jsx';
import { ActionWorkspace, FeaturePanel } from '../ui.jsx';
import { matchesShortcut, typingTarget } from '../../data/shortcuts.js';
import { createId, loadSpaceData, recyclePlaylists } from '../../data/spaceStorage.js';

import { alignNeteasePositions, mergeMusicPlaylist, neteasePlaylistTracks, nextQueuedTrack } from './musicCollection.js';

import { httpUrl } from '../mediaUrl.js';
import { useMusicResume, useMusicStorage } from './useMusicStorage.js';

function neteaseKind(url) {
  if (!['music.163.com', 'y.music.163.com'].includes(url.hostname)) return '';
  const type = (url.hash.slice(1) || url.pathname).match(/(?:^|\/)(song|album|playlist)(?:[/?]|$)/)?.[1];
  return { song: translate("i18n.track"), album: translate("i18n.album"), playlist: translate("i18n.playlist") }[type] ?? translate("i18n.neteaseCollection");
}

function formatTime(seconds) {
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

const localAudioExtensions = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'];

const playbackModes = { sequential: "i18n.playInOrder", repeat: "i18n.repeatOne", shuffle: "i18n.shuffle" };

const neteaseRetryDelays = [0, 350, 900, 1800];

function audioFailureMessage(audio, failure) {
  if (failure?.name === 'TimeoutError') return translate("i18n.theAudioServerTimedOutSelectPlay");
  if (failure?.name === 'NotAllowedError') return translate("i18n.autoplayDidNotStartSelectPlayTo");
  switch (audio.error?.code) {
    case 2: return translate("i18n.theAudioServerDisconnectedAfterProvidingA");
    case 3: return translate("i18n.thisAudioCouldNotBeDecoded");
    case 4: return translate("i18n.theAudioServerDidNotProvideA");
    default: return translate("i18n.audioDidNotStartSelectPlayTo");
  }
}

async function startOnlineAudio(audio) {
  let timeout;
  try {
    await Promise.race([
      audio.play(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new DOMException(translate("i18n.audioLoadingTimedOut"), 'TimeoutError')), 8000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export default function MusicPlayer({ catalogItem, onCatalogClose, navigation, open, onClose, shortcuts, shortcutsEnabled }) {
  const [tracks, setTracks] = useState(() => loadSpaceData('music', []).map((track) => ({ ...track, kind: httpUrl(track.url) ? neteaseKind(httpUrl(track.url)) : '', playlists: Array.isArray(track.playlists) ? track.playlists : [{ id: 'legacy-imports', title: '旧版导入' }] })));
  useEffect(() => {
    const refresh = event => {
      if (event.detail === 'music') setTracks(previous => [...previous.filter(track => track.local), ...loadSpaceData('music', [])]);
      if (event.detail === 'playlists') setSavedPlaylists(loadSpaceData('playlists', []));
    };
    window.addEventListener('cyber-bulk-updated', refresh);
    return () => window.removeEventListener('cyber-bulk-updated', refresh);
  }, []);
  const [savedPlaylists,setSavedPlaylists]=useState(()=>loadSpaceData('playlists',[]));
  const [listTitle,setListTitle]=useState('');
  const [createMusicType,setCreateMusicType]=useState('playlist');
  const [listSelection,setListSelection]=useState([]);
  const order = useContentOrder();
  const [musicView, setMusicView] = useNavigationState('music','view','player');
  const [playerEditor, setPlayerEditor] = useState(false);
  const [localEditor, setLocalEditor] = useState(null);
  const musicEditor = catalogItem?.type === 'music'
    ? { ...catalogItem, ...tracks.find(track => track.id === catalogItem.id) }
    : catalogItem || localEditor;
  const setMusicEditor = value => {
    if (catalogItem && value === null) onCatalogClose();
    else setLocalEditor(value);
  };
  useEffect(() => {
    if (!open) return;
    const item = navigation?.item;
    if (item?.catalogCommand || item?.type === 'playlist' || item?.type === 'music') setMusicView('playlists');
    setPlayerEditor(false);
  }, [open, navigation]);
  const { resume, elapsed, setElapsed } = useMusicResume();
  const [currentId, setCurrentId] = useState(resume.trackId ?? null);
  const [importNotice, setImportNotice] = useState('');
  const [playbackError, setPlaybackError] = useState('');
  const [playing, setPlaying] = useState(false);
  useActivityTime('music', playing);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);
  const pendingSeek = useRef(0);
  const selection = useRef(0);
  const spotifyTrack = useRef(null);
  const [spotifyOutput, setSpotifyOutput] = useState(null);
  const [spotifyDevices, setSpotifyDevices] = useState(null);
  const [spotifyDevicesBusy, setSpotifyDevicesBusy] = useState(false);
  const spotifyCommand = useRef(Promise.resolve());
  const startingOnline = useRef(false);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [preview, setPreview] = useState(false);
  const [playingPlaylistId, setPlayingPlaylistId] = useState(resume.playlistId ?? '');
  const [playlistFilter, setPlaylistFilter] = useNavigationState('music','playlistFilter',resume.playlistId ?? '');
    useEffect(() => {
    if (!open || hasRestoredView('music.playlistFilter')) return;
    const target = navigation?.item;
    if (target?.type === 'playlist') setPlaylistFilter(target.id);
    if (target?.type === 'music') setPlaylistFilter(target.playlists?.[0]?.id || 'legacy-imports');
  }, [open, navigation]);
  const [playlistModes, setPlaylistModes] = useState(() => loadSpaceData('musicPlaylistModes', {}));
  const [stagedImport, setStagedImport] = useState(null);
  const activeImport = useRef(false);
  const playlists = new Map(tracks.flatMap(track => (track.playlists ?? []).map(list => [
    list.id, [musicPlatformNames[track.provider], list.title].filter(Boolean).join(' · '),
  ])));
  savedPlaylists.forEach(p=>{const provider=p.provider || (['qq','netease','spotify'].includes(p.id.split(':')[0])?p.id.split(':')[0]:null);playlists.set(p.id,[p.showSource!==false?musicPlatformNames[provider]:null,p.title].filter(Boolean).join(' · '));});
  if (stagedImport) playlists.set(stagedImport.id, stagedImport.title);
  const storedTrack = tracks.find(track => track.id === currentId) ?? null;
  const current = stagedImport?.tracks.get(currentId)?.cachedUrl
    ? stagedImport.tracks.get(currentId)
    : storedTrack;
  const currentCover=useMusicCover(current);
  const belongsToPlayingPlaylist = current?.playlists?.some(list => list.id === playingPlaylistId)
    || (stagedImport?.id === playingPlaylistId && stagedImport.tracks.has(currentId));
  const songPlaylist = belongsToPlayingPlaylist ? playingPlaylistId : current?.playlists?.[0]?.id ?? '';
  const activeFilter = playlists.has(playlistFilter) ? playlistFilter : songPlaylist || playlists.keys().next().value || '';
  const tracksInPlaylist = id => {
    if (!id) return [];
    const entry = track => track.playlists?.find(list => list.id === id);
    const platformOrder = id.startsWith('netease:');
    const saved = platformOrder ? neteasePlaylistTracks(tracks, id) : orderType(tracks.filter(entry),'music',order);
    if (id !== stagedImport?.id) return saved;
    const merged = new Map(saved.map(track => [track.id, track]));
    for (const [trackId, track] of stagedImport.tracks) {
      const previous = merged.get(trackId);
      // A failed refresh must not hide or disable an existing collection entry.
      if (previous && track.cacheState !== 'ready') continue;
      merged.set(trackId, track);
    }
    if (platformOrder) {
      return [...stagedImport.tracks.keys()].map(key => merged.get(key))
        .concat(saved.filter(track => !stagedImport.tracks.has(track.id)));
    }
    return [...merged.values()];
  };
  const search=useSearchScope({id:'music',label:translate("i18n.allPlaylistsAndTracks"),priority:10,enabled:open,filters:[{key:'musicTarget',label:translate("i18n.searchBy"),options:[['song',translate("i18n.trackName")],['artist',translate("i18n.artistName")],['playlist',translate("i18n.playlistName")]]},{key:'provider',label:translate("i18n.platform"),options:[...new Set(tracks.map(t=>t.provider).filter(Boolean))].map(v=>[v,musicPlatformNames[v]||v])}]});
  const filteredLists = new Map();
  for(const [id,title] of playlists) {
    if (search.filters.playlistId && id !== search.filters.playlistId) continue;
    const songs=tracksInPlaylist(id);
    const list=savedPlaylists.find(p=>p.id===id)??songs.find(t=>t.playlists?.some(p=>p.id===id))?.playlists?.find(p=>p.id===id)??{title};
    const titleHit=!['song','artist'].includes(search.filters?.musicTarget)&&Boolean(search.query.trim())&&textMatches([list.title, entityTags('playlist', {...list,id})],search.query);
    const matching=songs.filter(t=>matchesItem('music',t,{...search,query:''})&&(titleHit||(search.filters?.musicTarget!=='playlist'&&textMatches(search.filters?.musicTarget==='artist'?[t.artist]:search.filters?.musicTarget==='song'?[t.title]:[t.title,t.artist,entityTags('music',t)],search.query))||!search.query.trim()));
    const provider=list.provider||(['qq','netease','spotify'].includes(id.split(':')[0])?id.split(':')[0]:null);
    if(!hasSearch(search)||(search.filters.playlistId && !search.query.trim() && !search.filters.provider)||matching.length||(titleHit&&(!search.filters?.provider||provider===search.filters.provider))) filteredLists.set(id,{title,songs:matching,record:{...list,id,trackNames:songs.map(track=>track.title)}});
  }
  const browserFilter=filteredLists.has(activeFilter)?activeFilter:filteredLists.keys().next().value??'';
  const displayedTracks=filteredLists.get(browserFilter)?.songs??[];
  useResultSource({ scopeId: 'music', priority:10,applications:{selectAll:musicView==='player'?undefined:resultEntities('music',displayedTracks)},label:musicView==='player'?translate("i18n.recordPlayer"):translate("i18n.playlistsAndTracks"),detail:musicView==='player',enabled:open,matches:musicView==='player'?resultEntities('music',[current]):[...resultEntities('playlist',[...filteredLists.values()].map(list=>list.record)),...resultEntities('music',displayedTracks)]});
  const [songQuery, setSongQuery] = useState('');
  const [existingIds, setExistingIds] = useState([]);
  const candidateTracks = tracks.filter(track => textMatches([track.title, track.artist], songQuery));
  const [importTarget, setImportTarget] = useState('');
  const destination = playlists.has(importTarget) ? importTarget : activeFilter;
  const selectedExisting = tracks.filter(track => existingIds.includes(track.id) &&
    !track.playlists?.some(list => list.id === destination));
  function addExistingTracks() {
    const target = savedPlaylists.find(list => list.id === destination)
      ?? tracks.flatMap(track => track.playlists ?? []).find(list => list.id === destination);
    if (!target || !selectedExisting.length) return;
    const ids = new Set(selectedExisting.map(track => track.id));
    setTracks(items => {
      let position = items.reduce((max, track) => Math.max(max,
        track.playlists?.find(list => list.id === target.id)?.position ?? -1), -1);
      return items.map(track => ids.has(track.id) && !track.playlists?.some(list => list.id === target.id)
        ? { ...track, playlists: [...(track.playlists ?? []), {id:target.id,title:target.title,position:++position}] } : track);
    });
    setPlaylistFilter(destination);
    setExistingIds([]);
    setSongQuery('');
  }
  useSearchCount('music',new Set([...filteredLists.values()].flatMap(list=>list.songs.map(t=>t.id))).size);
  const queue = tracksInPlaylist(songPlaylist || activeFilter)
    .filter(track => !track.kind && (!track.cacheState || track.cacheState === 'ready'));
  const queueIndex = queue.findIndex((track) => track.id === currentId);
  const [queueMode, setQueueMode] = useState(resume.queueMode ?? null);
  const modeFor = id => queueMode?.playlistId === id ? queueMode.mode : playlistModes[id] ?? 'sequential';
  const playbackMode = modeFor(songPlaylist || activeFilter);
  const playListedTrack = track => {
    if (track.cacheState && track.cacheState !== 'ready') return;
    if (songPlaylist && songPlaylist !== browserFilter) {
      setQueueMode({playlistId:browserFilter, mode:playbackMode});
    }
    setPlaylistFilter(browserFilter);
    selectTrack(track, browserFilter);
  };
  const nextTrack = manual => nextQueuedTrack(queue, queueIndex, playbackMode, manual);
  const previous = queueIndex > 0 ? queue[queueIndex - 1] : null;
  const storageSaved = useMusicStorage({ tracks, playlists: savedPlaylists, playlistModes, current, storedTrack, elapsed, songPlaylist, queueMode });
  const storageWarning = !storageSaved && <p role="alert">{translate('i18n.couldNotSaveLocalStorageMayBe')}</p>;

  const play = () => {
    setPlaybackError('');
    audioRef.current.play().catch((failure) => {
      if (failure.name !== 'AbortError') setPlaybackError(audioFailureMessage(audioRef.current, failure));
    });
  };

  const commandSpotify = (action, input) => {
    const pending = spotifyCommand.current.catch(() => {}).then(() => musicRequest('spotify', action, input));
    spotifyCommand.current = pending;
    return pending;
  };

  const selectTrack = async (track, playlistId = songPlaylist || activeFilter, { restart = false, output = spotifyOutput } = {}) => {
    if (track?.cacheState && track.cacheState !== 'ready') return;
    setPlayingPlaylistId(track ? playlistId : '');
    if (track?.id === currentId && startingOnline.current) return;
    const requestId = ++selection.current;
    const audio = audioRef.current;
    setPlaybackError('');
    if (track?.id === currentId && audio.hasAttribute('src') && !audio.error) {
      play();
      return;
    }

    startingOnline.current = false;
    setRetrying(false);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    setPlaying(false);
    pendingSeek.current = !restart && track?.id === currentId ? elapsed : 0;
    setElapsed(pendingSeek.current);
    setDuration(0);
    setPreview(false);
    setLoading(false);
    setCurrentId(track?.id ?? null);
    if (track?.provider !== 'spotify' && spotifyTrack.current) {
      const previousSpotify = spotifyTrack.current;
      try {
        await commandSpotify('pause', {deviceId:previousSpotify.deviceId});
        if (spotifyTrack.current === previousSpotify) spotifyTrack.current = null;
      }
      catch (failure) {
        if (selection.current === requestId) setPlaybackError(failure.message);
        return;
      }
      if (selection.current !== requestId) return;
    }
    if (!track || track.kind) return;

    if (track.provider === 'spotify') {
      const next = { id: track.sourceId, deviceId:output?.id, lastPosition: 0, duration: 0, seen: false };
      spotifyTrack.current = next;
      setLoading(true);
      try {
        const position = pendingSeek.current * 1000;
        await commandSpotify('play', {
          id: track.sourceId, position, deviceId: next.deviceId,
          playlistId: playlistId?.startsWith('spotify:') ? playlistId.slice(8) : undefined,
        });
        if (selection.current === requestId) next.started = true;
      } catch (failure) {
        if (selection.current === requestId) {
          spotifyTrack.current = null;
          setPlaybackError(failure.message);
        }
      } finally {
        if (selection.current === requestId) setLoading(false);
      }
      return;
    }

    if (track.cachedUrl || !track.provider) {
      if(!track.cachedUrl&&!track.url){setPlaybackError(translate("i18n.addALocalAudioFileToPlay"));return;}
      audio.src = track.cachedUrl || track.url;
      play();
      return;
    }

    setLoading(true);
    startingOnline.current = true;
    const delays = track.provider === 'netease' ? neteaseRetryDelays : [0];
    try {
      for (const [attempt, delay] of delays.entries()) {
        if (delay) {
          setRetrying(true);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        if (selection.current !== requestId) return;

        let stream;
        try {
          stream = await musicRequest(track.provider, 'cache-track', {
            id: track.sourceId, mediaMid: track.mediaMid, fee: track.fee,
          });
          if (selection.current !== requestId) return;
          audio.src = stream.cachedUrl;
          setTracks(items=>items.map(t=>t.id===track.id?{...t,cachedUrl:stream.cachedUrl,audioAssetId:stream.cachedUrl}:t));
          await startOnlineAudio(audio);
          if (selection.current === requestId) setPreview(stream.preview);
          return;
        } catch (failure) {
          if (selection.current !== requestId) return;
          const message = stream ? audioFailureMessage(audio, failure) : failure.message;
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
          const canRetry = stream
            ? !['AbortError', 'NotAllowedError'].includes(failure.name)
            : failure.retryable === true;
          if (canRetry && attempt + 1 < delays.length) continue;
          setPlaybackError(message);
          return;
        }
      }
    } finally {
      if (selection.current === requestId) {
        startingOnline.current = false;
        setLoading(false);
        setRetrying(false);
      }
    }
  };

  useEffect(() => {
    if (currentId && !current) selectTrack(null);
  }, [currentId, current]);

  // Older imported playlists have no stored artwork; refresh metadata without reimporting audio.
  useEffect(() => {
    if (musicEditor?.type !== 'playlist' || musicEditor.cover) return;
    const id=musicEditor.id;
    const provider=musicEditor.provider||id.split(':')[0];
    if (!['qq','netease','spotify'].includes(provider)) return;
    let active=true;
    musicRequest(provider,'playlists').then(({playlists: lists})=>{
      const sourceId=musicEditor.sourceId||id.slice(provider.length+1);
      const cover=lists?.find(list=>String(list.id)===String(sourceId))?.cover;
      if(!active||!cover)return;
      setSavedPlaylists(items=>{
        const previous=items.find(item=>item.id===id);
        const base=previous||{id,title:musicEditor.title,provider,sourceId};
        return [...items.filter(item=>item.id!==id),{...base,cover}];
      });
      setMusicEditor(item=>item?.id===id?{...item,cover}:item);
    }).catch(()=>{/* Existing collection artwork remains available when signed out. */});
    return()=>{active=false;};
  },[musicEditor?.id,musicEditor?.type]);

  const savePlaylist = (provider, list, imported, positions) => {
    setSavedPlaylists(items=>{const id=`${provider}:${list.id}`;const previous=items.find(p=>p.id===id);return [...items.filter(p=>p.id!==id),{...previous,id,title:previous?.title??list.title,description:previous?.description??'',provider,sourceId:String(list.id),cover:list.cover||previous?.cover||'',createdAt:previous?.createdAt??new Date().toISOString()}];});
    setTracks(items => mergeMusicPlaylist(items, provider, list, imported, positions));
  };

  const beginImport = (provider, list, imported) => {
    if (provider === 'spotify') {
      savePlaylist(provider, list, imported);
      setPlaylistFilter(`spotify:${list.id}`);
      return;
    }
    if (activeImport.current) throw new Error(translate("i18n.anotherPlaylistIsCachingTryAgainLater"));
    activeImport.current = true;

    const id = `${provider}:${list.id}`;
    const existing = new Map(tracks.map(track => [track.id, track.cachedUrl]));
    const rows = new Map(imported.map(item => {
      const trackId = `${provider}:${item.sourceId}`;
      const cachedUrl = existing.get(trackId);
      return [trackId, { ...item, id: trackId, cachedUrl, cacheState: cachedUrl ? 'ready' : 'pending' }];
    }));
    const positions = provider === 'netease' ? new Map([...rows.keys()].map((key, index) => [key, index])) : undefined;
    if (positions) setTracks(items => alignNeteasePositions(items, id, positions));
    savePlaylist(provider, list, []);
    setStagedImport({ id, title: `${musicPlatformNames[provider]} · ${list.title}`, tracks: rows });
    setPlaylistFilter(id);
    return {
      update(item, cacheState) {
        const trackId = `${provider}:${item.sourceId}`;
        const previous = rows.get(trackId);
        rows.set(trackId, { ...previous, ...item, id: trackId,
          cachedUrl: item.cachedUrl || previous?.cachedUrl,
          cacheState: previous?.cachedUrl ? 'ready' : cacheState });
        if (cacheState === 'ready') savePlaylist(provider, list, [item], positions);
        setStagedImport(previous => ({ ...previous, tracks: new Map(rows) }));
      },
      finish() {
        setStagedImport(null);
        activeImport.current = false;
      },
    };
  };

  const addFolder = async (event) => {
    const files = Array.from(event.target.files).filter(file =>
      localAudioExtensions.includes(file.name.split('.').pop().toLowerCase()),
    );
    event.target.value = '';
    if (!files.length) {
      setImportNotice(translate("i18n.theFolderContainsNoSupportedAudioFiles"));
      return;
    }

    const id = createId('folder');
    const createdAt = new Date().toISOString();
    const folderName = files[0].webkitRelativePath.split('/')[0] || '本地音频';
    files.sort((a, b) => a.webkitRelativePath.localeCompare(b.webkitRelativePath, undefined, { numeric: true }));
    const added=[];const failed=[];
    for(const [position,file] of files.entries()){try{if(!window.cyberStudy?.importLocalAudio)throw Error(translate("i18n.openTheDesktopAppToImport"));const result=await window.cyberStudy.importLocalAudio(new Uint8Array(await file.arrayBuffer()));if(result.error)throw Error(result.error);added.push({id:`local:${result.id}`,title:file.name,cachedUrl:result.cachedUrl,audioAssetId:result.audioAssetId,createdAt,playlists:[{id,title:folderName,position,createdAt}]});}catch(error){failed.push(`${file.name}：${error.message}`);}}
    setTracks(items => {const merged=new Map(items.map(t=>[t.id,t]));for(const t of added){const old=merged.get(t.id);merged.set(t.id,{...old,...t,createdAt:old ? old.createdAt : t.createdAt,playlists:[...(old?.playlists||[]).filter(p=>p.id!==id),...t.playlists]});}return [...merged.values()];});
    setPlaylistFilter(id);
    setImportNotice(translate("i18n.saved0AudioFiles1", added.length, failed.join('；')));
  };

  const removePlaylist = (id = activeFilter) => {
    if (!id) return;
    try { recyclePlaylists(new Set([id])); }
    catch (error) { setImportNotice(error.message); return; }
    if (songPlaylist === id) setPlayingPlaylistId('');
    setPlaylistFilter('');
  };

  const playPrevious = () => {
    if (previous) selectTrack(previous);
  };

  const playNext = () => {
    const track = nextTrack(true);
    if (track?.id === currentId && audioRef.current.readyState) audioRef.current.currentTime = 0;
    if (track) selectTrack(track, songPlaylist || activeFilter, { restart: true });
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    const track = current?.kind ? null : current ?? queue[0];
    if (!track || loading) return;
    if (track.provider === 'spotify' && spotifyTrack.current?.id === track.sourceId) {
      commandSpotify(playing ? 'pause' : 'resume', {deviceId:spotifyTrack.current.deviceId}).catch(error => setPlaybackError(error.message));
    } else if (!audio.hasAttribute('src') || audio.error) selectTrack(track);
    else if (audio.paused) play();
    else audio.pause();
  };

  useEffect(() => {
    if (!shortcutsEnabled) return;
    const handleKeyDown = (event) => {
      if (event.repeat || typingTarget(event.target)) return;
      if (matchesShortcut(event, shortcuts.toggleMusic) && (current || queue.length)) {
        event.preventDefault();
        togglePlayback();
      } else if (previous && matchesShortcut(event, shortcuts.previousTrack)) {
        event.preventDefault();
        playPrevious();
      } else if (queueIndex >= 0 && matchesShortcut(event, shortcuts.nextTrack)) {
        event.preventDefault();
        playNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const spotifyObservedTrack = useRef(null);
  spotifyObservedTrack.current = sourceId => {
    const track = queue.find(candidate => candidate.provider === 'spotify' && candidate.sourceId === sourceId);
    if (!track) return false;
    setCurrentId(track.id);
    return true;
  };
  const spotifyEnded = useRef(null);
  spotifyEnded.current = () => {
    const next = playbackMode === 'repeat' ? current : nextTrack();
    if (next) selectTrack(next, songPlaylist, { restart:true });
  };
  useEffect(() => {
    if (current?.provider !== 'spotify') return;
    let active = true;
    let timer;
    const poll = async () => {
      const tracked = spotifyTrack.current;
      try {
        if (!tracked?.started) return;
        const status = await musicRequest('spotify', 'playback-status', {deviceId:tracked.deviceId});
        if (!active || spotifyTrack.current !== tracked) return;
        if (!status.connected) {
          spotifyTrack.current = null;
          setPlaying(false);
          setPlaybackError(translate("i18n.spotifyDisconnectedConnectAgainToContinue"));
        } else if (status.stopped && tracked.seen && tracked.lastPosition + 2000 >= tracked.duration) {
          spotifyTrack.current = null;
          setPlaying(false);
          spotifyEnded.current();
        } else if (status.id === tracked.id && !status.stopped) {
          tracked.seen = true;
          tracked.lastPosition = status.position;
          tracked.duration = status.duration;
          setElapsed(status.position / 1000);
          setDuration(status.duration / 1000);
          setPlaying(status.playing);
        } else if (tracked.deviceId && status.id && spotifyObservedTrack.current(status.id)) {
          Object.assign(tracked, { id:status.id, lastPosition:status.position, duration:status.duration, seen:true });
          setElapsed(status.position / 1000);
          setDuration(status.duration / 1000);
          setPlaying(status.playing);
        } else if (tracked.seen) {
          spotifyTrack.current = null;
          setPlaying(false);
        }
      } catch (failure) {
        if (active && spotifyTrack.current === tracked) {
          setPlaying(false);
          setPlaybackError(failure.message);
        }
      } finally {
        if (active) timer = setTimeout(poll, 650);
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [current?.id, current?.provider]);

  const showPause = playing || Boolean(current && audioRef.current && !audioRef.current.paused);
  const findSpotifyDevices = async () => {
    setSpotifyDevicesBusy(true);
    try {
      const { devices } = await musicRequest('spotify', 'devices');
      setSpotifyDevices(devices);
    } catch (failure) { setPlaybackError(failure.message); }
    finally { setSpotifyDevicesBusy(false); }
  };
  const spotifyControls = current?.provider === 'spotify' && (playbackError || spotifyOutput) && (
    <div className="stack-form">
      {spotifyOutput && <p className="card-meta">{translate("i18n.spotifyPlaybackDevice")}{' '}{spotifyOutput.name}</p>}
      <button type="button" disabled={spotifyDevicesBusy} onClick={findSpotifyDevices}>{spotifyDevicesBusy ? translate("i18n.searching") : translate("i18n.chooseASpotifyConnectDevice")}</button>
      {spotifyDevices?.map(device => <button key={device.id} type="button" onClick={() => {
        setSpotifyOutput(device);
        setSpotifyDevices(null);
        void selectTrack(current, songPlaylist, {output:device});
      }}>{translate("i18n.on2")}{' '}{device.name}{' '}{translate("i18n.play")}</button>)}
      {spotifyDevices?.length === 0 && <>
        <p>{translate("i18n.signInToTheSameAccountIn")}</p>
        <button type="button" onClick={() => musicRequest('spotify', 'open-web-player').catch(error=>setPlaybackError(error.message))}>{translate("i18n.openSpotifyWebPlayer")}</button>
      </>}
    </div>
  );
  return (
    <>
      <audio
        ref={audioRef}
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onSeeking={() => setPlaying(false)}
        onSeeked={event => setPlaying(!event.currentTarget.paused && event.currentTarget.readyState >= 3)}
        onWaiting={() => setPlaying(false)}
        onError={event => {
          setPlaying(false);
          if (!startingOnline.current) setPlaybackError(audioFailureMessage(event.currentTarget));
        }}
        onLoadedMetadata={event => {
          const audio = event.currentTarget;
          if(Number.isFinite(audio.duration))setTracks(items=>items.map(t=>t.id===currentId?{...t,durationSeconds:audio.duration}:t));
          if (pendingSeek.current > 0 && Number.isFinite(audio.duration)) {
            audio.currentTime = pendingSeek.current < audio.duration ? pendingSeek.current : 0;
          }
          pendingSeek.current = 0;
        }}
        onTimeUpdate={event => {
          if (!pendingSeek.current) setElapsed(event.currentTarget.currentTime);
        }}
        onDurationChange={(event) => {
          const length = event.currentTarget.duration;
          setDuration(Number.isFinite(length) ? length : 0);
        }}
        onEnded={() => {
          setPlaying(false);
          const track = playbackMode === 'repeat' ? current : nextTrack();
          if (track) selectTrack(track);
        }}
      />
            {(open || catalogItem) && musicEditor && <MusicEntityEditor key={`${musicEditor.type}:${musicEditor.id}`} entity={{...musicEditor,fallbackCover:musicEditor.type==='playlist'?tracksInPlaylist(musicEditor.id).find(track=>track.cover)?.cover:undefined}}
              storageWarning={!open ? storageWarning : null} onClose={()=>setMusicEditor(null)} onCache={async()=>{
                const result=await musicRequest(musicEditor.provider,'cache-track',{id:musicEditor.sourceId,mediaMid:musicEditor.mediaMid,fee:musicEditor.fee});
                setTracks(items=>items.map(t=>t.id===musicEditor.id?{...t,cachedUrl:result.cachedUrl}:t));
                if (!catalogItem) setMusicEditor(item=>item?.id===musicEditor.id?{...item,cachedUrl:result.cachedUrl}:item);
              }} onSave={values=>{
                if(musicEditor.type==='playlist') {
                  const record={...musicEditor,...values}; delete record.type; delete record.key;
                  setSavedPlaylists(items=>[...items.filter(p=>p.id!==record.id),record]);
                  setTracks(items=>items.map(t=>({...t,playlists:t.playlists?.map(p=>p.id===record.id?{...p,title:record.title}:p)})));
                } else setTracks(items=>items.map(t=>t.id===musicEditor.id?{...t,...values}:t));
                setMusicEditor(null);
              }} onDelete={()=>{
                if(musicEditor.type==='playlist')removePlaylist(musicEditor.id);
                else {if(currentId===musicEditor.id)selectTrack(null);if(musicEditor.local)URL.revokeObjectURL(musicEditor.url);setTracks(items=>items.filter(t=>t.id!==musicEditor.id));removeEntityRelations('music:'+musicEditor.id);}
                setMusicEditor(null);
              }} />}
      {open && (
        <FeaturePanel scopeId="music" tipPage={`music-${musicView}`} hasMenu title="i18n.recordPlayer" scrollContext={musicView} kicker="Music Deck" description={translate("i18n.playPlaylistsOrLocalAudioMusicKeeps")} onClose={onClose}>
          {storageWarning}
          <nav className="globe-mode-switch" aria-label={translate("i18n.recordPlayerView")}>
            {[['player',translate("i18n.play")],['playlists',translate("i18n.playlist")]].map(([id,label]) => <button key={id} aria-pressed={musicView===id} onClick={()=>{setMusicView(id);setPlayerEditor(false);setMusicEditor(null);}}>{label}</button>)}
          </nav>
          <div className="music-pages">
            <ActionWorkspace command={false} showTrigger={false} kind="edit" title={translate("i18n.editPlayer")} open={playerEditor} onOpenChange={setPlayerEditor}>
              <div className="stack-form">
                <fieldset className="music-create-song-picker"><legend>{translate("i18n.playlist2")}</legend><div className="music-create-song-options music-player-options" role="radiogroup" aria-label={translate("i18n.playlist2")}>{Array.from(filteredLists,([id,list])=><label key={id}><input type="radio" name="player-playlist" checked={browserFilter===id} onChange={()=>setPlaylistFilter(id)}/><span>{list.title}</span></label>)}</div></fieldset>
                <label>{translate("i18n.playbackMode")}<select value={modeFor(browserFilter)} onChange={e=>{
                  const mode=e.target.value;
                  if(queueMode?.playlistId===browserFilter) setQueueMode(null);
                  setPlaylistModes(m=>({...m,[browserFilter]:mode}));
                }}>{Object.entries(playbackModes).map(([id,label])=><option key={id} value={id}>{translate(label)}</option>)}</select></label>
                <fieldset className="music-create-song-picker"><legend>{translate("i18n.track2")}</legend><div className="music-create-song-options music-player-options" role="radiogroup" aria-label={translate("i18n.track2")}>{displayedTracks.map(track=><label key={track.id}><input type="radio" name="player-track" checked={currentId===track.id&&songPlaylist===browserFilter} disabled={Boolean(track.cacheState&&track.cacheState!=='ready')} onChange={()=>selectTrack(track,browserFilter)}/><span>{track.title}</span></label>)}</div></fieldset>
                {!playlists.size&&<></>}
              </div>
            </ActionWorkspace>


            <section>
              <div data-entity-key={current && `music:${current.id}`} hidden={musicView!=='player'} {...editActivationProps(e => toggleEditor(setPlayerEditor, e, 'button,input,a,select'))} className={`record-deck ${playing ? 'playing' : ''}`}>
                <div className="record-disc">{currentCover && <img style={cropStyle(current?.photoCrop)} src={currentCover} alt="" />}<span /></div>
                <div>
                  <p>{current?.title ?? translate("i18n.noRecordSelected")}{preview && translate("i18n.preview")}</p>
                  {songPlaylist && <p className="card-meta">{playlists.get(songPlaylist)}</p>}
                  {loading && <p role="status">{retrying ? translate("i18n.refreshingAudioSource") : translate("i18n.loadingAudioSource")}</p>}
                  <div className="card-actions deck-transport">
                    <button type="button" disabled={!previous} onClick={playPrevious} aria-label={translate("i18n.previousTrack")}
                      title={shortcuts.previousTrack.join(' / ') || translate("i18n.previousTrack")}><span aria-hidden="true">⏮</span></button>
                    {current?.kind ? <a href={current.url} target="_blank" rel="noreferrer">{translate("i18n.playOnNeteaseCloudMusic")}</a> : (
                      <button className="deck-play" type="button" disabled={(!current && !queue.length) || loading} onClick={togglePlayback}
                        aria-label={showPause ? translate("i18n.pause") : translate("i18n.play")} title={shortcuts.toggleMusic.join(' / ') || (showPause ? translate("i18n.pause") : translate("i18n.play"))}>
                        <span aria-hidden="true">{showPause ? 'Ⅱ' : '▶'}</span>
                      </button>
                    )}
                    <button type="button" disabled={queueIndex < 0} onClick={playNext} aria-label={translate("i18n.nextTrack")}
                      title={shortcuts.nextTrack.join(' / ') || translate("i18n.nextTrack")}><span aria-hidden="true">⏭</span></button>
                  </div>
                  {(current?.spotifyUrl || current?.url) && !current.local && <a href={current.spotifyUrl || current.url} target="_blank" rel="noreferrer">{translate("i18n.openSource")}</a>}
                  {current && !current.kind && (
                    <div className="record-progress">
                      <input type="range" aria-label={translate("i18n.playbackProgress")} min="0" max={duration} step="0.1"
                        value={Math.min(elapsed, duration)} disabled={!duration}
                        onChange={(event) => {
                          const time = Number(event.target.value);
                          if (current.provider === 'spotify') commandSpotify('seek', { position: time * 1000, deviceId:spotifyTrack.current?.deviceId }).catch(error => setPlaybackError(error.message));
                          else audioRef.current.currentTime = time;
                          setElapsed(time);
                        }} />
                      <span>{formatTime(elapsed)} / {duration ? formatTime(duration) : '--:--'}</span>
                    </div>
                  )}
                  {playbackError && <p role="alert">{translateError(playbackError)}</p>}
                  {musicView==='player' && spotifyControls}
                </div>
              </div>
              {musicView !== 'player' && <ActionWorkspace label={translate("i18n.new")} title={translate("i18n.addMusic")}><div className="music-create-fields">
                <div className="music-create-kind"><select aria-label={translate("i18n.addMusicBy")} value={createMusicType} disabled={Boolean(stagedImport)} onChange={e=>setCreateMusicType(e.target.value)}>
                  <option value="playlist">{translate("i18n.newPlaylist")}</option><option value="local">{translate("i18n.importLocalTracks")}</option><option value="platform">{translate("i18n.connectAService")}</option>
                </select></div>
                {createMusicType==='playlist' && <div className="stack-form"><label>{translate("i18n.name")}<input value={listTitle} onChange={e=>setListTitle(e.target.value)}/></label><fieldset className="music-create-song-picker"><legend>{translate("i18n.includeTracks")}{' '}<span>{translate("i18n.optional")}</span></legend><input type="search" aria-label={translate("i18n.filterSongs")} placeholder={translate("i18n.filterSongs")} value={songQuery} onChange={e=>setSongQuery(e.target.value)}/><div className="music-create-song-options">{candidateTracks.length?candidateTracks.map(t=><label key={t.id}><input type="checkbox" checked={listSelection.includes(t.id)} onChange={e=>setListSelection(ids=>e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id))}/><span>{t.title}</span></label>):<></>}</div></fieldset><WorkspaceActions><button type="button" disabled={!listTitle.trim()} onClick={()=>{const id=createId('playlist');setSavedPlaylists(items=>[...items,{id,title:listTitle.trim(),description:'',provider:null,sourceId:null,createdAt:new Date().toISOString()}]);setTracks(items=>items.map(t=>listSelection.includes(t.id)?{...t,playlists:[...(t.playlists||[]),{id,title:listTitle.trim(),position:listSelection.indexOf(t.id)}]}:t));setPlaylistFilter(id);setListTitle('');setListSelection([]);}}>{translate("i18n.createPlaylist")}</button></WorkspaceActions></div>}
                {createMusicType==='local' && <div className="stack-form music-local-import"><label className="file-label">{translate("i18n.chooseAudioFiles")}<input type="file" multiple accept="audio/*" onChange={addFolder}/></label><label className="file-label">{translate("i18n.chooseAudioFolder")}<input type="file" webkitdirectory="" onChange={addFolder}/></label><fieldset className="music-create-song-picker">
                  <legend>{translate("i18n.existingSongs")}</legend>
                  <label>{translate("i18n.destinationPlaylist")}<select value={destination} onChange={e=>setImportTarget(e.target.value)}>
                    {[...playlists].map(([id,title])=><option key={id} value={id}>{title}</option>)}
                  </select></label>
                  <input type="search" aria-label={translate("i18n.filterSongs")} placeholder={translate("i18n.filterSongs")} value={songQuery} onChange={e=>setSongQuery(e.target.value)}/>
                  <div className="music-create-song-options">{candidateTracks.map(track=>{
                    const included = track.playlists?.some(list=>list.id===destination);
                    return <label key={track.id}><input type="checkbox" disabled={included} checked={Boolean(included)||existingIds.includes(track.id)}
                      onChange={e=>setExistingIds(ids=>e.target.checked?[...ids,track.id]:ids.filter(id=>id!==track.id))}/>
                      <span>{[track.title,track.artist].filter(Boolean).join(' · ')}</span></label>;
                  })}</div>
                  <button type="button" disabled={!destination||!selectedExisting.length} onClick={addExistingTracks}>{translate("i18n.addToPlaylist")}</button>
                </fieldset>{importNotice&&<p role="status">{importNotice}</p>}</div>}
                {createMusicType==='platform'&&<MusicSources search={search} onImport={beginImport} importing={Boolean(stagedImport)}/>}
              </div></ActionWorkspace>}
            </section>
            <section hidden={musicView==='player'} className="admin-list music-track-list">
              {musicView!=='player' && current?.provider==='spotify' && (loading || playbackError || spotifyOutput) && <div>
                {loading && <p role="status">{translate("i18n.loadingSpotifyAudio")}</p>}
                {playbackError && <p role="alert">{translateError(playbackError)}</p>}
                {spotifyControls}
              </div>}
              <div className="music-library-columns"><RecordShelf records={orderType([...filteredLists.values()].map(list=>list.record),'playlist',order)}
                selectedId={browserFilter} onSelect={setPlaylistFilter} title={filteredLists.get(browserFilter)?.title} count={displayedTracks.length}>
                {(record, distance, opened, activate) => {
                  const id=record.id, {title}=filteredLists.get(id);
                  const cover = record.cover || tracksInPlaylist(id).find(track => track.cover)?.cover;
                  const stored=savedPlaylists.find(p=>p.id===id);
                  const member=tracks.find(t=>t.playlists?.some(p=>p.id===id));
                  const entry=stored?{...stored,provider:stored.provider||(['qq','netease','spotify'].includes(id.split(':')[0])?id.split(':')[0]:null)}:{...record,id,title:member?.playlists?.find(p=>p.id===id)?.title??title,provider:member?.provider};
                  return <article className="music-playlist-item" data-edit-item key={id} data-centered={distance === 0} data-open={opened}
                    inert={Math.abs(distance) > 4 || undefined}
                    style={{'--offset': distance, '--side': Math.sign(distance), '--depth': Math.min(Math.abs(distance), 5),
                      '--hue': Array.from(id).reduce((h,c)=>(h*31+c.codePointAt(0))%360,0), zIndex: 10-Math.min(Math.abs(distance), 5)}}>
                    <ContentActions orderItem={record} preview={false} sortable surface=".music-playlist-item" type="playlist" id={id} title={title}/>
                    <ContentCommand label={translate("i18n.editPlaylist0", title)} disabled={id===stagedImport?.id} run={()=>setMusicEditor({...entry,type:'playlist'})}/>
                    <button className="sleeve-button" data-item-open type="button" aria-label={title} aria-pressed={opened} onClick={activate}>
                      <span className="sleeve-vinyl" aria-hidden="true" />
                      <PlaylistArt entry={entry} fallback={cover} title={record.title || title}/>
                    </button>
                  </article>;
                }}
              </RecordShelf><div key={browserFilter} className="music-song-column" data-scroll-memory={`songs-${browserFilter}`} aria-label={translate("i18n.tracks2")} tabIndex={0}><SearchStatus id="music" label={translate("i18n.track")}/>
              {displayedTracks.length === 0 ? <></> : displayedTracks.map((track) => (
                <article data-edit-select className={`admin-card ${track.id === currentId ? 'selected' : ''}`} key={track.id}>
                  <SongListing track={track} onPlay={()=>playListedTrack(track)} />
                  <ContentActions preview={false} orderItem={track} sortable={!browserFilter.startsWith('netease:')} type="music" id={track.id} title={track.title}/>
                  {tracks.some(item => item.id === track.id) && <>
                    <ContentCommand label={translate("i18n.editTrack0", track.title)} run={()=>setMusicEditor({...track,type:'music'})}/>
                  </>}
                  {track.cacheState && track.cacheState!=='ready' && <span className="card-meta">{track.cacheState==='failed'?translate("i18n.cachingFailed"):translate("i18n.waitingToCache")}</span>}
                  <button type="button" className="song-play" aria-label={translate("i18n.play0", track.title)} title={translate("i18n.play0", track.title)}
                    disabled={Boolean(track.kind || (track.cacheState && track.cacheState !== 'ready') || !(track.cachedUrl || track.url || track.provider))}
                    onClick={()=>playListedTrack(track)}><span aria-hidden="true">▶</span></button>

                </article>
              ))}</div></div>
            </section>
          </div>
        </FeaturePanel>
      )}
    </>
  );
}

function MusicEntityEditor({entity,onClose,onSave,onDelete,onCache,storageWarning}) {
  const [draft,setDraft]=useState({title:entity.title??'',artist:entity.artist??'',note:entity.note??'',description:entity.description??'',showSource:entity.showSource!==false});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [coverFile,setCoverFile]=useState(null);
  const cover=useMusicCover(entity);
  const replacement=useFilePreview(coverFile);
  const [photoCrop,setPhotoCrop]=useState(entity.photoCrop);
  const field=(key,label)=><label>{label}<input value={draft[key]} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/></label>;
  return <ActionWorkspace command={false} showTrigger={false} kind="edit" title={entity.type==='playlist'?translate("i18n.editPlaylist"):translate("i18n.editTrack")} open onOpenChange={v=>{if(!v&&!busy)onClose();}}>
    <form className="stack-form" onSubmit={async e=>{e.preventDefault();if(busy||!draft.title.trim())return;setBusy(true);setError('');try{
      let coverAssetId=entity.coverAssetId;
      if(coverFile){const record=await globalThis.ContentAssets.repository('cyber-study-content-assets-v1').add(`${entity.type}:${entity.id}`,[coverFile]);coverAssetId=record.imageAssetIds.at(-1);}
      const values=entity.type==='playlist'?{title:draft.title.trim(),description:draft.description,showSource:draft.showSource}:{title:draft.title.trim(),artist:draft.artist,note:draft.note,showSource:draft.showSource};
      await onSave({...values,coverAssetId,photoCrop});
      if(coverFile)window.dispatchEvent(new Event('cyber-content-changed'));
    }catch(failure){setError(failure.message);}finally{setBusy(false);}}}>
      <WorkspaceFields><EntityTagsField type={entity.type === 'playlist' ? 'playlist' : 'music'} item={entity}/>
        {field('title',translate("i18n.name"))}
        <label>{translate("i18n.cover")}<input type="file" accept="image/*" disabled={busy} onChange={e=>{setCoverFile(e.target.files[0]??null);setPhotoCrop(null);setError('');}}/></label>
        {(replacement || cover) && <PhotoCrop src={replacement || cover} ratio={1} value={photoCrop} onChange={setPhotoCrop}/>}
        {entity.type==='playlist'?field('description',translate("i18n.description")):<>{field('artist',translate("i18n.artist"))}{field('note',translate("i18n.notes"))}</>}
        <label>{translate("i18n.showSourcePrefix")}<input type="checkbox" checked={draft.showSource} onChange={e=>setDraft(d=>({...d,showSource:e.target.checked}))}/></label>
        <label>{translate("i18n.source")}<span>{musicPlatformNames[entity.provider]||translate("i18n.localCollection")}</span></label>
        {entity.type==='music'&&<><label>{translate("i18n.cacheStatus")}<span>{entity.provider==='spotify'?translate("i18n.onlinePlayback"):entity.cachedUrl?translate("i18n.cached"):entity.local?translate("i18n.playableThisSession"):translate("i18n.notCached")}</span></label>
          {entity.durationSeconds>0&&<label>{translate("i18n.duration")}<span>{formatTime(entity.durationSeconds)}</span></label>}
          {!entity.cachedUrl&&entity.provider&&entity.provider!=='spotify'&&entity.sourceId&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onCache();}catch(e){setError(e.message);}finally{setBusy(false);}}}>{busy?translate("i18n.caching2"):translate("i18n.cacheAgain")}</button>}
        </>}
        {storageWarning}
        {error&&<p role="alert">{translateError(error)}</p>}
      </WorkspaceFields>
      <WorkspaceActions><button disabled={busy||!draft.title.trim()}>{translate("i18n.save")}</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm(translate("i18n.delete02", entity.title)))onDelete();}}>{translate("i18n.delete")}</button></WorkspaceActions>
    </form>
  </ActionWorkspace>;
}

function PlaylistArt({entry,fallback,title}) {
  const cover=useMusicCover({...entry,fallbackCover:fallback});
  return <span className="sleeve-art">{cover && <img style={cropStyle(entry.photoCrop)} src={cover} alt="" draggable={false}/>}<b>{title}</b></span>;
}

function SongListing({track, onPlay}) {
  const cover = useMusicCover(track);
  const [failedCover,setFailedCover] = useState(null);
  return <button className="music-song-open song-listing" type="button" data-item-open
    disabled={Boolean(track.cacheState && track.cacheState !== 'ready')} onClick={onPlay}>
    <span className="song-thumbnail" aria-hidden="true">
      {cover && cover !== failedCover && <img style={cropStyle(track.photoCrop)} src={cover} loading="lazy" draggable={false} alt="" onError={()=>setFailedCover(cover)}/>}
    </span>
    <span className="song-credits"><strong>{track.title}</strong>{track.artist && <small>{track.artist}</small>}</span>
  </button>;
}

function useMusicCover(entity) {
  const [local,setLocal]=useState(null);
  const id=entity?.coverAssetId;
  useEffect(()=>{let active=true,url;setLocal(null);if(id)globalThis.ContentAssets.repository('cyber-study-content-assets-v1').asset(id).then(asset=>{if(active&&asset?.blob){url=URL.createObjectURL(asset.blob);setLocal({id,url});}}).catch(()=>{});return()=>{active=false;if(url)URL.revokeObjectURL(url);};},[id]);
  return (local?.id===id?local?.url:null)||entity?.cover||entity?.fallbackCover||'';
}

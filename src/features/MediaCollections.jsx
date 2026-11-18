import RecordShelf from './RecordShelf.jsx';
import useContentOrder from '../ui/useContentOrder.js';
import { orderType } from '../data/contentOrder.js';
import { toggleEditor, editActivationProps } from '../ui/editGesture.js';
import useMapSource, {mapEntities} from '../ui/useMapSource.js';
import '../../shared/contentAssets.js';
import { hasRestoredView } from '../data/viewNavigation.js';
import { useNavigationState } from '../ui/useNavigationState.js';
import { WorkspaceActions } from './ui.jsx';
import { ContentCommand, ContentEditButton } from './ContentCommands.jsx';
import {useSearchCount,useSearchScope,SearchStatus,dateFilters} from '../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../search/searchCore.js';
import ContentActions from './ContentActions.jsx';
import { useEffect, useRef, useState } from 'react';
import { MusicSources, musicPlatformNames, musicRequest } from './MusicSources.jsx';
import { ActionWorkspace, FeaturePanel } from './ui.jsx';
import { matchesShortcut, typingTarget } from '../data/shortcuts.js';
import { createId, loadSpaceData, saveSpaceData } from '../data/spaceStorage.js';

import { mergeMusicPlaylist } from '../data/musicCollection.js';
import { doubanSubjectId, readDoubanMovie, splitMovieRegions } from './doubanMovie.js';

function httpUrl(value) {
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch { return null; }
}

function neteaseKind(url) {
  if (!['music.163.com', 'y.music.163.com'].includes(url.hostname)) return '';
  const type = (url.hash.slice(1) || url.pathname).match(/(?:^|\/)(song|album|playlist)(?:[/?]|$)/)?.[1];
  return { song: '歌曲', album: '专辑', playlist: '歌单' }[type] ?? '网易云收藏';
}

function formatTime(seconds) {
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

const localAudioExtensions = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'];

const playbackModes = { sequential: '顺序播放', repeat: '单曲循环', shuffle: '随机播放' };

const neteaseRetryDelays = [0, 350, 900, 1800];

function audioFailureMessage(audio, failure) {
  if (failure?.name === 'TimeoutError') return '音频服务器响应超时，请点击播放重试。';
  if (failure?.name === 'NotAllowedError') return '应用未能自动开始播放，请手动点击播放。';
  switch (audio.error?.code) {
    case 2: return '已取得播放地址，但与音频服务器的连接中断。';
    case 3: return '已取得播放地址，但应用无法解码这段音频。';
    case 4: return '已取得播放地址，但音频服务器未提供可播放的内容。';
    default: return '音频未能开始播放，请点击播放重试。';
  }
}

async function startOnlineAudio(audio) {
  let timeout;
  try {
    await Promise.race([
      audio.play(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new DOMException('音频加载超时。', 'TimeoutError')), 8000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function MusicPlayer({ catalogItem, onCatalogClose, navigation, open, onClose, shortcuts, shortcutsEnabled }) {
  const [tracks, setTracks] = useState(() => loadSpaceData('music', []).map((track) => ({ ...track, kind: httpUrl(track.url) ? neteaseKind(httpUrl(track.url)) : '', playlists: track.playlists?.length ? track.playlists : [{ id: 'legacy-imports', title: '旧版导入' }] })));
  const [savedPlaylists,setSavedPlaylists]=useState(()=>loadSpaceData('playlists',[]));
  const [listTitle,setListTitle]=useState('');
  const [createMusicType,setCreateMusicType]=useState('playlist');
  const [listSelection,setListSelection]=useState([]);
  const order = useContentOrder();
  useEffect(()=>{saveSpaceData('playlists',savedPlaylists);},[savedPlaylists]);
  const [musicView, setMusicView] = useState('player');
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
    setMusicView(item?.catalogCommand || item?.type === 'playlist' || item?.type === 'music' ? 'playlists' : 'player');
    setPlayerEditor(false);
  }, [open, navigation]);
  const [resume] = useState(() => loadSpaceData('musicResume', {}));
  const [currentId, setCurrentId] = useState(resume.trackId ?? null);
  const [importNotice, setImportNotice] = useState('');
  const [playbackError, setPlaybackError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(resume.position ?? 0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);
  const pendingSeek = useRef(0);
  const selection = useRef(0);
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
  savedPlaylists.forEach(p=>{const provider=p.provider || (['qq','netease'].includes(p.id.split(':')[0])?p.id.split(':')[0]:null);playlists.set(p.id,[p.showSource!==false?musicPlatformNames[provider]:null,p.title].filter(Boolean).join(' · '));});
  if (stagedImport) playlists.set(stagedImport.id, stagedImport.title);
  const current = stagedImport?.tracks.get(currentId)?.cachedUrl
    ? stagedImport.tracks.get(currentId)
    : tracks.find(track => track.id === currentId) ?? null;
  const currentCover=useMusicCover(current);
  const belongsToPlayingPlaylist = current?.playlists?.some(list => list.id === playingPlaylistId)
    || (stagedImport?.id === playingPlaylistId && stagedImport.tracks.has(currentId));
  const songPlaylist = belongsToPlayingPlaylist ? playingPlaylistId : current?.playlists?.[0]?.id ?? '';
  const activeFilter = playlists.has(playlistFilter) ? playlistFilter : songPlaylist || playlists.keys().next().value || '';
  const tracksInPlaylist = id => {
    if (!id) return [];
    const entry = track => track.playlists?.find(list => list.id === id);
    const saved = orderType(tracks.filter(entry),'music',order);
    if (id !== stagedImport?.id) return saved;
    const merged = new Map(saved.map(track => [track.id, track]));
    for (const [trackId, track] of stagedImport.tracks) {
      const previous = merged.get(trackId);
      // A failed refresh must not hide or disable an existing collection entry.
      if (previous && track.cacheState !== 'ready') continue;
      merged.set(trackId, track);
    }
    return [...merged.values()];
  };
  const search=useSearchScope({id:'music',label:'所有歌单与歌曲',priority:10,enabled:open,filters:[{key:'musicTarget',label:'搜索对象',options:[['song','歌曲名'],['artist','歌手名'],['playlist','歌单名']]},{key:'provider',label:'平台',options:[...new Set(tracks.map(t=>t.provider).filter(Boolean))].map(v=>[v,musicPlatformNames[v]||v])}]});
  const filteredLists = new Map();
  for(const [id,title] of playlists) {
    if (search.filters.playlistId && id !== search.filters.playlistId) continue;
    const songs=tracksInPlaylist(id);
    const list=savedPlaylists.find(p=>p.id===id)??songs.find(t=>t.playlists?.some(p=>p.id===id))?.playlists?.find(p=>p.id===id)??{title};
    const titleHit=!['song','artist'].includes(search.filters?.musicTarget)&&Boolean(search.query.trim())&&textMatches([list.title],search.query);
    const matching=songs.filter(t=>matchesItem('music',t,{...search,query:''})&&(titleHit||(search.filters?.musicTarget!=='playlist'&&textMatches(search.filters?.musicTarget==='artist'?[t.artist]:search.filters?.musicTarget==='song'?[t.title]:[t.title,t.artist],search.query))||!search.query.trim()));
    const provider=list.provider||(['qq','netease'].includes(id.split(':')[0])?id.split(':')[0]:null);
    if(!hasSearch(search)||(search.filters.playlistId && !search.query.trim() && !search.filters.provider)||matching.length||(titleHit&&(!search.filters?.provider||provider===search.filters.provider))) filteredLists.set(id,{title,songs:matching,record:{...list,id,trackNames:songs.map(track=>track.title)}});
  }
  const browserFilter=filteredLists.has(activeFilter)?activeFilter:filteredLists.keys().next().value??'';
  const displayedTracks=filteredLists.get(browserFilter)?.songs??[];
  useMapSource({priority:10,label:musicView==='player'?'歌曲播放器':'歌单与歌曲',detail:musicView==='player',enabled:open,entities:musicView==='player'?mapEntities('music',[current]):[...mapEntities('playlist',[...filteredLists.values()].map(list=>list.record)),...mapEntities('music',displayedTracks)]});
  const candidateIds=new Set([...filteredLists.values()].flatMap(list=>list.songs.map(t=>t.id)));
  const candidateTracks=hasSearch(search)?tracks.filter(t=>candidateIds.has(t.id)):tracks;
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
  const nextTrack = (manual = false) => {
    if (queueIndex < 0) return null;
    if (manual && queueIndex === queue.length - 1) return queue[0];
    if (playbackMode === 'shuffle' && queue.length > 1) {
      const index = Math.floor(Math.random() * (queue.length - 1));
      return queue[index < queueIndex ? index : index + 1];
    }
    return queue[queueIndex + 1] ?? queue[0];
  };
  const previous = queueIndex > 0 ? queue[queueIndex - 1] : null;

  useEffect(() => {
    saveSpaceData('music', tracks.filter((track) => !track.local));
  }, [tracks]);

  useEffect(() => {
    saveSpaceData('musicPlaylistModes', playlistModes);
  }, [playlistModes]);

  useEffect(() => {
    const savedTrack = tracks.find(track => track.id === currentId && !track.local && !track.kind);
    if (savedTrack) {
      saveSpaceData('musicResume', { trackId: savedTrack.id, position: elapsed, playlistId: songPlaylist, queueMode });
    } else if (!current) {
      saveSpaceData('musicResume', {});
    }
  }, [tracks, current, currentId, elapsed, songPlaylist, queueMode]);

  const play = () => {
    setPlaybackError('');
    audioRef.current.play().catch((failure) => {
      if (failure.name !== 'AbortError') setPlaybackError(audioFailureMessage(audioRef.current, failure));
    });
  };

  const selectTrack = async (track, playlistId = songPlaylist || activeFilter) => {
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
    pendingSeek.current = track?.id === currentId ? elapsed : 0;
    setElapsed(pendingSeek.current);
    setDuration(0);
    setPreview(false);
    setLoading(false);
    setCurrentId(track?.id ?? null);
    if (!track || track.kind) return;

    if (track.cachedUrl || !track.provider) {
      if(!track.cachedUrl&&!track.url){setPlaybackError('这是一张音乐资料卡，请先补充本地音频。');return;}
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
    if (!['qq','netease'].includes(provider)) return;
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

  const savePlaylist = (provider, list, imported) => {
    setSavedPlaylists(items=>{const id=`${provider}:${list.id}`;const previous=items.find(p=>p.id===id);return [...items.filter(p=>p.id!==id),{...previous,id,title:previous?.title??list.title,description:previous?.description??'',provider,sourceId:String(list.id),cover:list.cover||previous?.cover||'',createdAt:previous?.createdAt??new Date().toISOString()}];});
    setTracks(items => mergeMusicPlaylist(items, provider, list, imported));
  };

  const beginImport = (provider, list, imported) => {
    if (activeImport.current) throw new Error('正在缓存另一张歌单，请稍后再导入。');
    activeImport.current = true;
    savePlaylist(provider,list,[]);
    const id = `${provider}:${list.id}`;
    const existing = new Map(tracks.map(track => [track.id, track.cachedUrl]));
    const rows = new Map(imported.map(item => {
      const trackId = `${provider}:${item.sourceId}`;
      const cachedUrl = existing.get(trackId);
      return [trackId, { ...item, id: trackId, cachedUrl, cacheState: cachedUrl ? 'ready' : 'pending' }];
    }));
    setStagedImport({ id, title: `${musicPlatformNames[provider]} · ${list.title}`, tracks: rows });
    setPlaylistFilter(id);
    return {
      update(item, cacheState) {
        const trackId = `${provider}:${item.sourceId}`;
        const previous = rows.get(trackId);
        rows.set(trackId, { ...previous, ...item, id: trackId,
          cachedUrl: item.cachedUrl || previous?.cachedUrl,
          cacheState: previous?.cachedUrl ? 'ready' : cacheState });
        if (cacheState === 'ready') savePlaylist(provider, list, [item]);
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
      setImportNotice('文件夹中没有支持的音频。');
      return;
    }

    const id = createId('folder');
    const createdAt = new Date().toISOString();
    const folderName = files[0].webkitRelativePath.split('/')[0] || '本地音频';
    files.sort((a, b) => a.webkitRelativePath.localeCompare(b.webkitRelativePath, undefined, { numeric: true }));
    const added=[];const failed=[];
    for(const [position,file] of files.entries()){try{if(!window.cyberStudy?.importLocalAudio)throw Error('请在桌面应用中导入');const result=await window.cyberStudy.importLocalAudio(new Uint8Array(await file.arrayBuffer()));if(result.error)throw Error(result.error);added.push({id:`local:${result.id}`,title:file.name,cachedUrl:result.cachedUrl,audioAssetId:result.audioAssetId,createdAt,playlists:[{id,title:folderName,position,createdAt}]});}catch(error){failed.push(`${file.name}：${error.message}`);}}
    setTracks(items => {const merged=new Map(items.map(t=>[t.id,t]));for(const t of added){const old=merged.get(t.id);merged.set(t.id,{...old,...t,createdAt:old ? old.createdAt : t.createdAt,playlists:[...(old?.playlists||[]).filter(p=>p.id!==id),...t.playlists]});}return [...merged.values()];});
    setPlaylistFilter(id);
    setImportNotice(`已保存 ${added.length} 首音频。${failed.join('；')}`);
  };

  const removePlaylist = (id = activeFilter) => {
    if (!id) return;
    setSavedPlaylists(items=>items.filter(p=>p.id!==id));
    for (const track of tracksInPlaylist(id)) {
      if (!track.playlists?.some(list => list.id === id) || track.playlists.length > 1) continue;
      if (track.id === currentId) selectTrack(null);
      if (track.local) URL.revokeObjectURL(track.url);
    }
    setTracks(items => items.flatMap(track => {
      if (!track.playlists?.some(list => list.id === id)) return [track];
      const remaining = track.playlists.filter(list => list.id !== id);
      return remaining.length ? [{ ...track, playlists: remaining }] : [];
    }));
    setPlaylistFilter('');
  };

  const playPrevious = () => {
    if (previous) selectTrack(previous);
  };

  const playNext = () => {
    const track = nextTrack(true);
    if (track?.id === currentId && audioRef.current.readyState) audioRef.current.currentTime = 0;
    if (track) selectTrack(track);
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    const track = current?.kind ? null : current ?? queue[0];
    if (!track || loading) return;
    if (!audio.hasAttribute('src') || audio.error) selectTrack(track);
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

  const showPause = playing || Boolean(current && audioRef.current && !audioRef.current.paused);
  return (
    <>
      <audio
        ref={audioRef}
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
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
              onClose={()=>setMusicEditor(null)} onCache={async()=>{
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
                else {if(currentId===musicEditor.id)selectTrack(null);if(musicEditor.local)URL.revokeObjectURL(musicEditor.url);setTracks(items=>items.filter(t=>t.id!==musicEditor.id));}
                setMusicEditor(null);
              }} />}
      {open && (
        <FeaturePanel hasMenu title="唱片机" kicker="Music Deck" description="播放在线歌单或本地音频。返回书房后可以继续听。" onClose={onClose}>
          <nav className="globe-mode-switch" aria-label="唱片机视图">
            {[['player','播放'],['playlists','歌单']].map(([id,label]) => <button key={id} aria-pressed={musicView===id} onClick={()=>{setMusicView(id);setPlayerEditor(false);setMusicEditor(null);}}>{label}</button>)}
          </nav>
          <div className="music-pages">
            <ActionWorkspace command={false} showTrigger={false} title="编辑播放器" open={playerEditor} onOpenChange={setPlayerEditor}>
              <div className="stack-form">
                <fieldset className="music-create-song-picker"><legend>播放歌单</legend><div className="music-create-song-options music-player-options" role="radiogroup" aria-label="播放歌单">{Array.from(filteredLists,([id,list])=><label key={id}><input type="radio" name="player-playlist" checked={browserFilter===id} onChange={()=>setPlaylistFilter(id)}/><span>{list.title}</span></label>)}</div></fieldset>
                <label>播放模式<select value={modeFor(browserFilter)} onChange={e=>{
                  const mode=e.target.value;
                  if(queueMode?.playlistId===browserFilter) setQueueMode(null);
                  setPlaylistModes(m=>({...m,[browserFilter]:mode}));
                }}>{Object.entries(playbackModes).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
                <fieldset className="music-create-song-picker"><legend>播放歌曲</legend><div className="music-create-song-options music-player-options" role="radiogroup" aria-label="播放歌曲">{displayedTracks.map(track=><label key={track.id}><input type="radio" name="player-track" checked={currentId===track.id&&songPlaylist===browserFilter} disabled={Boolean(track.cacheState&&track.cacheState!=='ready')} onChange={()=>selectTrack(track,browserFilter)}/><span>{track.title}</span></label>)}</div></fieldset>
                {!playlists.size&&<></>}
              </div>
            </ActionWorkspace>


            <section>
              <div hidden={musicView!=='player'} {...editActivationProps(e => toggleEditor(setPlayerEditor, e, 'button,input,a,select'))} className={`record-deck ${playing ? 'playing' : ''}`}>
                <div className="record-disc">{currentCover && <img src={currentCover} alt="" />}<span /></div>
                <div>
                  <p>{current?.title ?? '未选择唱片'}{preview && ' · 试听'}</p>
                  {songPlaylist && <p className="card-meta">{playlists.get(songPlaylist)}</p>}
                  {loading && <p role="status">{retrying ? '正在重新获取音源…' : '正在加载音源…'}</p>}
                  <div className="card-actions deck-transport">
                    <button type="button" disabled={!previous} onClick={playPrevious} aria-label="上一首"
                      title={shortcuts.previousTrack.join(' / ') || '上一首'}><span aria-hidden="true">⏮</span></button>
                    {current?.kind ? <a href={current.url} target="_blank" rel="noreferrer">在网易云音乐播放</a> : (
                      <button className="deck-play" type="button" disabled={(!current && !queue.length) || loading} onClick={togglePlayback}
                        aria-label={showPause ? '暂停' : '播放'} title={shortcuts.toggleMusic.join(' / ') || (showPause ? '暂停' : '播放')}>
                        <span aria-hidden="true">{showPause ? 'Ⅱ' : '▶'}</span>
                      </button>
                    )}
                    <button type="button" disabled={queueIndex < 0} onClick={playNext} aria-label="下一首"
                      title={shortcuts.nextTrack.join(' / ') || '下一首'}><span aria-hidden="true">⏭</span></button>
                  </div>
                  {current?.url && !current.local && <a href={current.url} target="_blank" rel="noreferrer">打开来源</a>}
                  {current && !current.kind && (
                    <div className="record-progress">
                      <input type="range" aria-label="播放进度" min="0" max={duration} step="0.1"
                        value={Math.min(elapsed, duration)} disabled={!duration}
                        onChange={(event) => {
                          const time = Number(event.target.value);
                          audioRef.current.currentTime = time;
                          setElapsed(time);
                        }} />
                      <span>{formatTime(elapsed)} / {duration ? formatTime(duration) : '--:--'}</span>
                    </div>
                  )}
                  {playbackError && <p role="alert">{playbackError}</p>}
                </div>
              </div>
              {musicView !== 'player' && <ActionWorkspace label="新建" title="新建音乐内容"><div className="music-create-fields">
                <div className="music-create-kind"><select aria-label="新建方式" value={createMusicType} disabled={Boolean(stagedImport)} onChange={e=>setCreateMusicType(e.target.value)}>
                  <option value="playlist">新建歌单</option><option value="local">导入本地歌曲</option><option value="platform">连接平台</option>
                </select></div>
                {createMusicType==='playlist' && <div className="stack-form"><label>名称<input value={listTitle} onChange={e=>setListTitle(e.target.value)}/></label><fieldset className="music-create-song-picker"><legend>收录歌曲 <span>可不选</span></legend><div className="music-create-song-options">{candidateTracks.length?candidateTracks.map(t=><label key={t.id}><input type="checkbox" checked={listSelection.includes(t.id)} onChange={e=>setListSelection(ids=>e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id))}/><span>{t.title}</span></label>):<></>}</div></fieldset><WorkspaceActions><button type="button" disabled={!listTitle.trim()} onClick={()=>{const id=createId('playlist');setSavedPlaylists(items=>[...items,{id,title:listTitle.trim(),description:'',provider:null,sourceId:null,createdAt:new Date().toISOString()}]);setTracks(items=>items.map(t=>listSelection.includes(t.id)?{...t,playlists:[...(t.playlists||[]),{id,title:listTitle.trim(),position:listSelection.indexOf(t.id)}]}:t));setPlaylistFilter(id);setListTitle('');setListSelection([]);}}>创建歌单</button></WorkspaceActions></div>}
                {createMusicType==='local' && <div className="stack-form music-local-import"><label className="file-label">选择音频文件<input type="file" multiple accept="audio/*" onChange={addFolder}/></label><label className="file-label">选择音频文件夹<input type="file" webkitdirectory="" onChange={addFolder}/></label>{importNotice&&<p role="status">{importNotice}</p>}</div>}
                {createMusicType==='platform'&&<MusicSources search={search} onImport={beginImport} importing={Boolean(stagedImport)}/>}
              </div></ActionWorkspace>}
            </section>
            <section hidden={musicView==='player'} className="admin-list music-track-list">
              <div className="music-library-columns"><RecordShelf records={orderType([...filteredLists.values()].map(list=>list.record),'playlist',order)}
                selectedId={browserFilter} onSelect={setPlaylistFilter} title={filteredLists.get(browserFilter)?.title} count={displayedTracks.length}>
                {(record, distance, opened, activate) => {
                  const id=record.id, {title}=filteredLists.get(id);
                  const cover = record.cover || tracksInPlaylist(id).find(track => track.cover)?.cover;
                  const stored=savedPlaylists.find(p=>p.id===id);
                  const member=tracks.find(t=>t.playlists?.some(p=>p.id===id));
                  const entry=stored?{...stored,provider:stored.provider||(['qq','netease'].includes(id.split(':')[0])?id.split(':')[0]:null)}:{...record,id,title:member?.playlists?.find(p=>p.id===id)?.title??title,provider:member?.provider};
                  return <article className="music-playlist-item" data-edit-item key={id} data-centered={distance === 0} data-open={opened}
                    inert={Math.abs(distance) > 4 || undefined}
                    style={{'--offset': distance, '--side': Math.sign(distance), '--depth': Math.min(Math.abs(distance), 5),
                      '--hue': Array.from(id).reduce((h,c)=>(h*31+c.codePointAt(0))%360,0), zIndex: 10-Math.min(Math.abs(distance), 5)}}>
                    <ContentActions orderItem={record} preview={false} sortable surface=".music-playlist-item" type="playlist" id={id} title={title}/>
                    <ContentCommand label={`编辑歌单 · ${title}`} disabled={id===stagedImport?.id} run={()=>setMusicEditor({...entry,type:'playlist'})}/>
                    <button className="sleeve-button" data-item-open type="button" aria-label={title} aria-pressed={opened} onClick={activate}>
                      <span className="sleeve-vinyl" aria-hidden="true" />
                      <span className="sleeve-art">{cover && <img src={cover} alt="" draggable={false} onError={e=>{e.currentTarget.hidden=true;}} key={cover}/>}
                        <b>{record.title || title}</b></span>
                    </button>
                  </article>;
                }}
              </RecordShelf><div key={browserFilter} className="music-song-column" aria-label="歌曲列表" tabIndex={0}><SearchStatus id="music" label="歌曲"/>
              {displayedTracks.length === 0 ? <></> : displayedTracks.map((track) => (
                <article data-edit-select className={`admin-card ${track.id === currentId ? 'selected' : ''}`} key={track.id}>
                  <SongListing track={track} onPlay={()=>playListedTrack(track)} />
                  <ContentActions preview={false} orderItem={track} sortable type="music" id={track.id} title={track.title}/>
                  {tracks.some(item => item.id === track.id) && <>
                    <ContentCommand label={`编辑歌曲 · ${track.title}`} run={()=>setMusicEditor({...track,type:'music'})}/>
                  </>}
                  {track.cacheState && track.cacheState!=='ready' && <span className="card-meta">{track.cacheState==='failed'?'缓存失败':'等待缓存'}</span>}
                  <button type="button" className="song-play" aria-label={`播放 · ${track.title}`} title={`播放 · ${track.title}`}
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

const movieDraft = { title: '', url: '', status: '想看', poster: '', douban: '', score: '', region: '', genres: '', tags: '' };

const movieFilterGroups = [
  { key: 'region', label: '国家／地区', values: (movie) => splitMovieRegions(movie.region) },
  { key: 'genres', label: '类型', values: (movie) => movie.genres ?? [] },
  { key: 'tags', label: '自定义标签', values: (movie) => movie.tags ?? [] }
];

function splitMovieLabels(value) {
  return [...new Set(value.split(/[,，、]+/).map((label) => label.trim()).filter(Boolean))];
}

function movieFields(movie) { return { ...movieDraft, ...movie, region: splitMovieRegions(movie.region).join(' / '), genres: (movie.genres ?? []).join('，'), tags: (movie.tags ?? []).join('，') }; }

function MovieCollection({ onClose, editItem }) {
  const [movies, setMovies] = useState(() => loadSpaceData('movies', []));
  const filmStrip = useRef(null);
  useEffect(() => {
    const strip = filmStrip.current;
    if (!strip) return;
    function scrollFilm(event) {
      if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)
          || event.target.closest('select') || !event.cancelable) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1;
      const previous = strip.scrollLeft;
      strip.scrollLeft += event.deltaY * unit;
      if (strip.scrollLeft !== previous) event.preventDefault();
    }
    strip.addEventListener('wheel', scrollFilm, { passive: false });
    return () => strip.removeEventListener('wheel', scrollFilm);
  }, [editItem]);
  const [draft, setDraft] = useState(() => editItem ? movieFields(movies.find(movie => movie.id === editItem.id) ?? editItem) : movieDraft);
  const [editing, setEditing] = useState(editItem?.id ?? null);
  const [editorOpen, setOpen] = useState(Boolean(editItem));
  const setEditorOpen = open => { setOpen(open); if (!open && editItem) onClose(); };
  const search=useSearchScope({id:'movie',label:'影片',priority:10,filters:movieFilterGroups.map(g=>({key:g.key,label:g.label,options:[...new Set(movies.flatMap(g.values))].sort().map(v=>[v,v])}))});
  const filters=search.filters;
  const [error, setError] = useState('');
  const [fetchingDouban, setFetchingDouban] = useState(false);
  const [choosingPoster, setChoosingPoster] = useState(false);
  const formBusy = fetchingDouban || choosingPoster;
  const [localPosters, setLocalPosters] = useState({});
  const movieForm = useRef(null);
  const titleInput = useRef(null);
  const posterInput = useRef(null);
  const posterRequests = useRef(new Set());
  useEffect(() => {
    if (!window.cyberStudy?.cacheMoviePoster) return;
    const posters = new Set([draft.poster, ...movies.map((movie) => movie.poster)]);
    for (const poster of posters) {
      const url = poster && httpUrl(poster);
      if (!url || !/(^|\.)(doubanio\.com|douban\.com)$/.test(url.hostname) || posterRequests.current.has(poster)) continue;
      posterRequests.current.add(poster);
      window.cyberStudy.cacheMoviePoster(poster).then((local) => {
        if (local) setLocalPosters((current) => ({ ...current, [poster]: local }));
        else posterRequests.current.delete(poster);
      }).catch(() => posterRequests.current.delete(poster));
    }
  }, [draft.poster, movies]);
  const [doubanMessage, setDoubanMessage] = useState('');
  const field = (key) => ({
    value: draft[key],
    onChange: (event) => {
      const value = event.target.value;
      setDraft((current) => ({ ...current, [key]: value }));
      if (key === 'douban') setDoubanMessage('');
    }
  });

  const selectPoster = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || formBusy) return;
    if (!window.cyberStudy?.uploadMoviePoster) {
      setError('请完全退出并重启赛博书房桌面版后再上传海报。');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('海报图片不能超过 8 MB。');
      return;
    }
    setError('');
    setChoosingPoster(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { poster, error: uploadError } = await window.cyberStudy.uploadMoviePoster(bytes);
      if (uploadError) setError(uploadError);
      if (poster) setDraft((current) => ({ ...current, poster }));
    } catch {
      setError('无法读取或保存海报图片。');
    } finally {
      setChoosingPoster(false);
    }
  };

  const fillFromDouban = async () => {
    if (formBusy) return;
    setError('');
    setDoubanMessage('');
    const subjectId = doubanSubjectId(httpUrl(draft.douban));
    if (!subjectId) { setError('请粘贴豆瓣电影详情页链接，例如 movie.douban.com/subject/1292052/。'); return; }
    if (!window.cyberStudy?.doubanMovie) { setError('请在赛博书房桌面版中获取豆瓣资料。'); return; }

    setFetchingDouban(true);
    try {
      let result = await window.cyberStudy.doubanMovie(subjectId);
      let details = result.html && readDoubanMovie(result.html);
      if (!details && !result.error && window.cyberStudy.doubanMovieInBrowser) {
        setDoubanMessage('正在后台加载豆瓣条目…');
        result = await window.cyberStudy.doubanMovieInBrowser(subjectId);
        details = result.html && readDoubanMovie(result.html);
      }
      if (!details) {
        setDoubanMessage('');
        setError(result.error || '未能从豆瓣页面读取影片资料，请稍后重试或手动填写。');
        return;
      }
      setDraft((current) => ({
        ...current,
        ...details,
        douban: `https://movie.douban.com/subject/${subjectId}/`
      }));
      setDoubanMessage('已填入可获取的豆瓣资料，可以修改后保存。');
    } catch {
      setDoubanMessage('');
      setError('获取豆瓣资料失败，请稍后重试或手动填写。');
    } finally {
      setFetchingDouban(false);
    }
  };

  const persist = (next) => {
    if (!saveSpaceData('movies', next)) { setError('保存失败，本地存储可能已满。'); return false; }
    setMovies(next);
    setError('');
    return true;
  };

  const addMovie = () => {
    if (formBusy) return;
    const url = httpUrl(draft.url);
    const poster = /^study-poster:\/\/movie\/[a-f0-9]{64}\.(?:webp|jpg|png|gif)$/.test(draft.poster)
      ? new URL(draft.poster) : httpUrl(draft.poster);
    const douban = httpUrl(draft.douban);
    if (draft.url.trim() && !url) { setError('请输入 B 站或其他网页的有效链接。'); return; }
    if (draft.poster.trim() && !poster) { setError('请输入有效的海报链接。'); return; }
    if ((draft.douban.trim() || draft.score.trim()) && !doubanSubjectId(douban)) {
      setError('请输入对应影片的豆瓣电影条目链接。');
      return;
    }
    if (!draft.title.trim()) { setError('请填写影片名称。'); return; }
    const score = draft.score.trim();
    if (score && (!/^\d{1,2}(?:\.\d)?$/.test(score) || Number(score) > 10)) {
      setError('请输入 0–10 之间的豆瓣评分。');
      return;
    }
    const record = {
      ...draft, title: draft.title.trim(), url: url?.href ?? '', poster: localPosters[draft.poster] || poster?.href || '', douban: douban?.href ?? '',
      score, region: splitMovieRegions(draft.region), genres: splitMovieLabels(draft.genres), tags: splitMovieLabels(draft.tags).slice(0, 5)
    };
    const next = editing ? movies.map((movie) => movie.id === editing ? { ...movie, ...record } : movie)
      : [{ ...record, id: createId('movie'), createdAt: new Date().toISOString() }, ...movies];
    if (persist(next)) { setDraft(movieDraft); setEditorOpen(false); setEditing(null); setDoubanMessage(''); }
  };

  const editMovie = (movie) => {
    if (formBusy || (editorOpen && editing === movie.id)) return;
    setEditorOpen(true); setEditing(movie.id);
    setDraft(movieFields(movie));
    setError('');
    setDoubanMessage('');
    movieForm.current?.scrollIntoView({ block: 'nearest' });
    titleInput.current?.focus({ preventScroll: true });
  };
  const cancelEdit = () => {
    setEditing(null);
    setDraft(movieDraft);
    setError('');
    setDoubanMessage('');
  };
  const deleteMovie = () => {
    if (window.confirm('删除这条影片记录？') && persist(movies.filter((movie) => movie.id !== editing))) { cancelEdit(); setEditorOpen(false); }
  };
  const groups = movieFilterGroups.map((group) => {
    const options = [...new Set(movies.flatMap(group.values))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    return { ...group, options, selected: filters[group.key] || '' };
  });
  const order = useContentOrder();
  const visibleMovies = orderType(movies,'movie',order).filter((movie) => matchesItem('movie',movie,search) && groups.every(({ selected, values }) =>
    !selected || values(movie).includes(selected)));

  useMapSource({priority:10,entities:mapEntities('movie',visibleMovies)});
  useSearchCount('movie',visibleMovies.length);
  const editor = (<ActionWorkspace disabled={formBusy} onCreate={() => { if (editing) cancelEdit(); }} label="新建影片" title={editing ? '编辑影片' : '新建影片'} open={editorOpen} onOpenChange={setEditorOpen}><form ref={movieForm} className="stack-form" onSubmit={(event) => { event.preventDefault(); addMovie(); }}>
      <label>链接<input {...field('url')} placeholder="B 站或其他来源链接（可稍后补充）" /></label>
      <input ref={titleInput} {...field('title')} placeholder="影片名称（可稍后补充）" />
      <div className="movie-poster-field">
        {draft.poster && <img key={localPosters[draft.poster] || draft.poster} src={localPosters[draft.poster] || draft.poster}
          referrerPolicy="no-referrer" alt="海报预览" />}
        <input ref={posterInput} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={selectPoster} />
        <button type="button" disabled={formBusy} onClick={() => posterInput.current?.click()}>{draft.poster ? '更换海报' : '上传海报'}</button>
        {draft.poster && <ContentEditButton label="清除当前影片海报" disabled={formBusy} run={() => setDraft(current => ({ ...current, poster: '' }))} />}
      </div>
      <div className="panel-toolbar">
        <label>豆瓣<input {...field('douban')} placeholder="豆瓣电影条目链接" aria-label="豆瓣电影条目链接" disabled={formBusy} /></label>
        <button type="button" onClick={fillFromDouban} disabled={formBusy || !draft.douban.trim()}>{fetchingDouban ? '正在获取…' : '获取豆瓣资料'}</button>
      </div>
      <div className="panel-toolbar">
        <label>地区<input {...field('region')} aria-label="影片国家或地区" placeholder="国家／地区，用斜线分隔" /></label>
        <label>评分<input {...field('score')} inputMode="decimal" placeholder="豆瓣评分" /></label>
      </div>
      <label>类型<input {...field('genres')} aria-label="影片类型" placeholder="类型，逗号分隔" /></label>
      <div className="panel-toolbar">
        <label>标签<input {...field('tags')} placeholder="自定义标签，逗号分隔" /></label>
        <select {...field('status')} aria-label="观看状态"><option>想看</option><option>在看</option><option>看过</option></select>
      </div>
      <WorkspaceActions>
        <button type="submit" disabled={formBusy}>{editing ? '保存' : '加入影架'}</button>
        {editing && <ContentEditButton label="删除" disabled={formBusy} run={deleteMovie} />}
      </WorkspaceActions>
      {error && <p role="alert">{error}</p>}
      {doubanMessage && <p role="status">{doubanMessage}</p>}
    </form></ActionWorkspace>);
  if (editItem) return editor;
  return <FeaturePanel wide title="影碟机与屏幕" kicker="Movie Shelf" onClose={onClose}>
    {editor}
    <div className="movie-collection" data-editor-open={editorOpen}>
      <SearchStatus id="movie" label="影片"/>

      <div className="movie-posters" ref={filmStrip}>
        {visibleMovies.map((movie) => {
          const title = movie.title || '待补充片名';
          const destination = httpUrl(movie.url || '')?.href;
          const selected = editorOpen && editing === movie.id;
          const posterContent = <>
            <span className="movie-poster-placeholder">{title}</span>
            {movie.poster && <img key={localPosters[movie.poster] || movie.poster} src={localPosters[movie.poster] || movie.poster} referrerPolicy="no-referrer" alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}
          </>;
          return <article className="movie-tile" key={movie.id}>
            <div className="movie-poster">
              {editorOpen
                ? <button type="button" data-instant-selection className="movie-poster-link movie-poster-select"
                    aria-label={`编辑${title}`} aria-pressed={selected} disabled={formBusy} onClick={() => editMovie(movie)}>{posterContent}</button>
                : destination
                  ? <a data-item-open className="movie-poster-link" href={destination} target="_blank" rel="noreferrer" aria-label={`打开${title}`}>{posterContent}</a>
                  : posterContent}
              <ContentCommand label={`编辑影片 · ${movie.title || '未命名'}`} disabled={formBusy} run={() => editMovie(movie)} />
              <ContentCommand label={`删除影片 · ${movie.title || '未命名'}`} disabled={formBusy} confirm run={() => persist(movies.filter(item => item.id !== movie.id))} />
              {selected
                ? <select className="movie-status" aria-label={`${title}观看状态`} {...field('status')} disabled={formBusy}>
                    <option>想看</option><option>在看</option><option>看过</option>
                  </select>
                : <span className="movie-status">{movie.status || '想看'}</span>}
              <div className="movie-caption">
                <h3>{!editorOpen && destination ? <a data-item-open href={destination} target="_blank" rel="noreferrer">{title}</a> : title}</h3>
                {movie.score && (movie.douban
                  ? <a className="movie-score" href={movie.douban} target="_blank" rel="noreferrer" aria-label={`豆瓣评分 ${movie.score}`}>{movie.score}</a>
                  : <span className="movie-score">{movie.score}</span>)}
                {(splitMovieRegions(movie.region).length > 0 || movie.genres?.length > 0) &&
                  <p>{[splitMovieRegions(movie.region).join(' / '), (movie.genres ?? []).join(' / ')].filter(Boolean).join(' · ')}</p>}
              </div>
            </div>
            <ContentActions orderItem={movie} type="movie" id={movie.id} title={title}/>
          </article>;
        })}
      </div>
    </div>
  </FeaturePanel>;
}

export { MusicPlayer, MovieCollection };


function MusicEntityEditor({entity,onClose,onSave,onDelete,onCache}) {
  const [draft,setDraft]=useState({title:entity.title??'',artist:entity.artist??'',note:entity.note??'',description:entity.description??'',showSource:entity.showSource!==false});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [coverFile,setCoverFile]=useState(null);
  const cover=useMusicCover(entity);
  const field=(key,label)=><label>{label}<input value={draft[key]} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/></label>;
  return <ActionWorkspace command={false} showTrigger={false} title={entity.type==='playlist'?'编辑歌单':'编辑歌曲'} open onOpenChange={v=>{if(!v&&!busy)onClose();}}>
    <form className="stack-form" onSubmit={async e=>{e.preventDefault();if(busy||!draft.title.trim())return;setBusy(true);setError('');try{
      let coverAssetId=entity.coverAssetId;
      if(coverFile){const record=await globalThis.ContentAssets.repository('cyber-study-content-assets-v1').add(`${entity.type}:${entity.id}`,[coverFile]);coverAssetId=record.imageAssetIds.at(-1);}
      const values=entity.type==='playlist'?{title:draft.title.trim(),description:draft.description,showSource:draft.showSource}:{title:draft.title.trim(),artist:draft.artist,note:draft.note,showSource:draft.showSource};
      await onSave({...values,coverAssetId});
      if(coverFile)window.dispatchEvent(new Event('cyber-content-changed'));
    }catch(failure){setError(failure.message);}finally{setBusy(false);}}}>
      {field('title','名称')}
      <label>封面<input type="file" accept="image/*" disabled={busy} onChange={e=>{setCoverFile(e.target.files[0]??null);setError('');}}/></label>
      {coverFile?<p className="card-meta">已选择：{coverFile.name}，保存后更换。</p>:cover&&<img className="music-editor-cover" src={cover} alt="当前封面"/>}
      {entity.type==='playlist'?field('description','简介'):<>{field('artist','歌手')}{field('note','备注')}</>}
      <label>显示来源前缀<input type="checkbox" checked={draft.showSource} onChange={e=>setDraft(d=>({...d,showSource:e.target.checked}))}/></label>
      <label>来源<span>{musicPlatformNames[entity.provider]||'本地收藏'}</span></label>
      {entity.type==='music'&&<><label>缓存状态<span>{entity.cachedUrl?'已缓存':entity.local?'本次打开可播放':'未缓存'}</span></label>
        {entity.durationSeconds>0&&<label>时长<span>{formatTime(entity.durationSeconds)}</span></label>}
        {!entity.cachedUrl&&entity.provider&&entity.sourceId&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onCache();}catch(e){setError(e.message);}finally{setBusy(false);}}}>{busy?'正在缓存…':'重新缓存'}</button>}
      </>}
      {error&&<p role="alert">{error}</p>}
      <WorkspaceActions><button disabled={busy||!draft.title.trim()}>保存</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm(`确认删除${entity.title}？`))onDelete();}}>删除</button></WorkspaceActions>
    </form>
  </ActionWorkspace>;
}

function SongListing({track, onPlay}) {
  const cover = useMusicCover(track);
  const [failedCover,setFailedCover] = useState(null);
  return <button className="music-song-open song-listing" type="button" data-item-open
    disabled={Boolean(track.cacheState && track.cacheState !== 'ready')} onClick={onPlay}>
    <span className="song-thumbnail" aria-hidden="true">
      {cover && cover !== failedCover && <img src={cover} loading="lazy" draggable={false} alt="" onError={()=>setFailedCover(cover)}/>}
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

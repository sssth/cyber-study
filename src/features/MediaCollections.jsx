import { useEffect, useRef, useState } from 'react';
import { MusicSources, musicPlatformNames, musicRequest } from './MusicSources.jsx';
import { FeaturePanel, EmptyState } from './ui.jsx';
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

const localAudioExtensions = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'oga', 'opus', 'webm'];

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

function MusicPlayer({ open, onClose, shortcuts, shortcutsEnabled }) {
  const [tracks, setTracks] = useState(() => loadSpaceData('music', []).map((track) => ({ ...track, kind: httpUrl(track.url) ? neteaseKind(httpUrl(track.url)) : '', playlists: track.playlists?.length ? track.playlists : [{ id: 'legacy-imports', title: '旧版导入' }] })));
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
  const [playlistFilter, setPlaylistFilter] = useState(resume.playlistId ?? '');
  const [playlistModes, setPlaylistModes] = useState(() => loadSpaceData('musicPlaylistModes', {}));
  const [stagedImport, setStagedImport] = useState(null);
  const activeImport = useRef(false);
  const playlists = new Map(tracks.flatMap(track => (track.playlists ?? []).map(list => [
    list.id, [musicPlatformNames[track.provider], list.title].filter(Boolean).join(' · '),
  ])));
  if (stagedImport) playlists.set(stagedImport.id, stagedImport.title);
  const current = stagedImport?.tracks.get(currentId)?.cachedUrl
    ? stagedImport.tracks.get(currentId)
    : tracks.find(track => track.id === currentId) ?? null;
  const belongsToPlayingPlaylist = current?.playlists?.some(list => list.id === playingPlaylistId)
    || (stagedImport?.id === playingPlaylistId && stagedImport.tracks.has(currentId));
  const songPlaylist = belongsToPlayingPlaylist ? playingPlaylistId : current?.playlists?.[0]?.id ?? '';
  const activeFilter = playlists.has(playlistFilter) ? playlistFilter : songPlaylist || playlists.keys().next().value || '';
  const tracksInPlaylist = id => {
    if (!id) return [];
    const entry = track => track.playlists?.find(list => list.id === id);
    const saved = tracks.filter(entry).sort((a, b) => (entry(a).position ?? 0) - (entry(b).position ?? 0));
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
  const displayedTracks = tracksInPlaylist(activeFilter);
  const queue = tracksInPlaylist(songPlaylist || activeFilter)
    .filter(track => !track.kind && (!track.cacheState || track.cacheState === 'ready'));
  const queueIndex = queue.findIndex((track) => track.id === currentId);
  const playbackMode = playlistModes[songPlaylist || activeFilter] ?? 'sequential';
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
      saveSpaceData('musicResume', { trackId: savedTrack.id, position: elapsed, playlistId: songPlaylist });
    } else if (!current) {
      saveSpaceData('musicResume', {});
    }
  }, [tracks, current, currentId, elapsed, songPlaylist]);

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
          stream = await musicRequest(track.provider, 'stream', {
            id: track.sourceId, mediaMid: track.mediaMid, fee: track.fee,
          });
          if (selection.current !== requestId) return;
          audio.src = stream.url;
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

  const savePlaylist = (provider, list, imported) => {
    setTracks(items => mergeMusicPlaylist(items, provider, list, imported));
  };

  const beginImport = (provider, list, imported) => {
    if (activeImport.current) throw new Error('正在缓存另一张歌单，请稍后再导入。');
    activeImport.current = true;
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

  const addFolder = (event) => {
    const files = Array.from(event.target.files).filter(file =>
      localAudioExtensions.includes(file.name.split('.').pop().toLowerCase()),
    );
    event.target.value = '';
    if (!files.length) {
      setImportNotice('文件夹中没有支持的音频。');
      return;
    }

    const id = createId('folder');
    const folderName = files[0].webkitRelativePath.split('/')[0] || '本地音频';
    files.sort((a, b) => a.webkitRelativePath.localeCompare(b.webkitRelativePath, undefined, { numeric: true }));
    const added = files.map((file, position) => ({
      id: createId('track'),
      title: file.name,
      url: URL.createObjectURL(file),
      local: true,
      playlists: [{ id, title: folderName, position }],
    }));
    setTracks(items => [...items, ...added]);
    setPlaylistFilter(id);
    setImportNotice(`已导入 ${added.length} 首音频。`);
  };

  const removePlaylist = () => {
    if (!activeFilter) return;
    for (const track of displayedTracks) {
      if (track.playlists.length > 1) continue;
      if (track.id === currentId) selectTrack(null);
      if (track.local) URL.revokeObjectURL(track.url);
    }
    setTracks(items => items.flatMap(track => {
      if (!track.playlists?.some(list => list.id === activeFilter)) return [track];
      const remaining = track.playlists.filter(list => list.id !== activeFilter);
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
      {open && (
        <FeaturePanel title="唱片机" kicker="Music Deck" description="播放在线歌单或本地音频。返回书房后可以继续听。" onClose={onClose}>
          <div className="media-layout music-layout">
            <section>
              <div className={`record-deck ${playing ? 'playing' : ''}`}>
                <div className="record-disc">{current?.cover && <img src={current.cover} alt="" />}<span /></div>
                <div>
                  <p>{current?.title ?? '未选择唱片'}{preview && ' · 试听'}</p>
                  {songPlaylist && <p className="card-meta">{playlists.get(songPlaylist)}</p>}
                  {loading && <p role="status">{retrying ? '正在重新获取音源…' : '正在加载音源…'}</p>}
                  <div className="card-actions">
                    {current?.kind ? <a href={current.url} target="_blank" rel="noreferrer">在网易云音乐播放</a> : (
                      <button type="button" disabled={(!current && !queue.length) || loading} onClick={togglePlayback}
                        title={shortcuts.toggleMusic.join(' / ') || undefined}>{playing || (current && !audioRef.current?.paused) ? '暂停' : '播放'}</button>
                    )}
                    <button type="button" disabled={!previous} onClick={playPrevious}
                      title={shortcuts.previousTrack.join(' / ') || undefined}>上一首</button>
                    <button type="button" disabled={queueIndex < 0} onClick={playNext}
                      title={shortcuts.nextTrack.join(' / ') || undefined}>下一首</button>
                    {current?.url && !current.local && <a href={current.url} target="_blank" rel="noreferrer">打开来源</a>}
                  </div>
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
              <MusicSources onImport={beginImport} importing={Boolean(stagedImport)} />
              <div className="music-folder-import">
                <label className="file-label">
                  导入音频文件夹
                  <input type="file" webkitdirectory="" onChange={addFolder} />
                </label>
                <p>包含子文件夹。本次打开有效。</p>
                <p>支持 {localAudioExtensions.map(extension => extension.toUpperCase()).join('、')}</p>
                {importNotice && <p role="status">{importNotice}</p>}
              </div>
            </section>
            <section className="admin-list music-track-list">
              {playlists.size > 0 && (
                <div className="music-playlist-actions">
                  <select aria-label="唱片架歌单" value={activeFilter} onChange={event => setPlaylistFilter(event.target.value)}>
                    {Array.from(playlists, ([id, title]) => <option key={id} value={id}>{title}</option>)}
                  </select>
                  {activeFilter && <button type="button" disabled={activeFilter === stagedImport?.id} onClick={removePlaylist}>移除歌单</button>}
                </div>
              )}
              {displayedTracks.length > 0 && (
                <label className="music-playback-mode">
                  播放模式
                  <select value={playlistModes[activeFilter] ?? 'sequential'} onChange={event => {
                    const mode = event.target.value;
                    setPlaylistModes(modes => ({ ...modes, [activeFilter]: mode }));
                  }}>
                    {Object.entries(playbackModes).map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}
                  </select>
                </label>
              )}
              {displayedTracks.length === 0 ? <EmptyState>暂无唱片。</EmptyState> : displayedTracks.map((track) => (
                <article className={`admin-card ${track.id === currentId ? 'selected' : ''}`} key={track.id}>
                  <div className="music-track-copy"><p className="card-kicker">{[track.kind || musicPlatformNames[track.provider] || '收藏曲目', track.artist || track.note].filter(Boolean).join(' · ')}</p><h3>{track.title}</h3><p className="card-meta">{track.local ? '本地音频' : track.provider ? '' : httpUrl(track.url)?.hostname}</p></div>
                  <div className="card-actions">
                    {track.cacheState === 'pending' || track.cacheState === 'failed'
                      ? <span className="card-meta">{track.cacheState === 'failed' ? '缓存失败' : '等待缓存'}</span>
                      : <button type="button" onClick={() => selectTrack(track, activeFilter)}>{track.kind ? '查看唱片' : '播放'}</button>}
                  </div>
                </article>
              ))}
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

function MovieCollection({ onClose }) {
  const [movies, setMovies] = useState(() => loadSpaceData('movies', []));
  const [draft, setDraft] = useState(movieDraft);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});
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
    if (!url && !douban) { setError('请填写来源链接或豆瓣电影条目链接。'); return; }
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
    if (persist(next)) { setDraft(movieDraft); setEditing(null); setDoubanMessage(''); }
  };

  const editMovie = (movie) => {
    setEditing(movie.id);
    setDraft({ ...movieDraft, ...movie, region: splitMovieRegions(movie.region).join(' / '), genres: (movie.genres ?? []).join('，'), tags: (movie.tags ?? []).join('，') });
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
    if (window.confirm('删除这条影片记录？') && persist(movies.filter((movie) => movie.id !== editing))) cancelEdit();
  };
  const groups = movieFilterGroups.map((group) => {
    const options = [...new Set(movies.flatMap(group.values))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    return { ...group, options, selected: options.includes(filters[group.key]) ? filters[group.key] : '' };
  });
  const visibleMovies = movies.filter((movie) => groups.every(({ selected, values }) =>
    !selected || values(movie).includes(selected)));

  return <FeaturePanel wide title="影碟机与屏幕" kicker="Movie Shelf" onClose={onClose}>
    <form ref={movieForm} className="stack-form" onSubmit={(event) => { event.preventDefault(); addMovie(); }}>
      <input {...field('url')} placeholder="B 站或其他来源链接（可稍后补充）" />
      <input ref={titleInput} {...field('title')} placeholder="影片名称（可稍后补充）" />
      <div className="movie-poster-field">
        {draft.poster && <img key={localPosters[draft.poster] || draft.poster} src={localPosters[draft.poster] || draft.poster}
          referrerPolicy="no-referrer" alt="海报预览" />}
        <input ref={posterInput} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={selectPoster} />
        <button type="button" disabled={formBusy} onClick={() => posterInput.current?.click()}>{draft.poster ? '更换海报' : '上传海报'}</button>
        {draft.poster && <button type="button" disabled={formBusy} onClick={() => setDraft((current) => ({ ...current, poster: '' }))}>移除海报</button>}
      </div>
      <div className="panel-toolbar">
        <input {...field('douban')} placeholder="豆瓣电影条目链接" aria-label="豆瓣电影条目链接" disabled={formBusy} />
        <button type="button" onClick={fillFromDouban} disabled={formBusy || !draft.douban.trim()}>{fetchingDouban ? '正在获取…' : '获取豆瓣资料'}</button>
      </div>
      <div className="panel-toolbar">
        <input {...field('region')} aria-label="影片国家或地区" placeholder="国家／地区，用斜线分隔" />
        <input {...field('score')} inputMode="decimal" placeholder="豆瓣评分" />
      </div>
      <input {...field('genres')} aria-label="影片类型" placeholder="类型，逗号分隔" />
      <div className="panel-toolbar">
        <input {...field('tags')} placeholder="自定义标签，逗号分隔" />
        <select {...field('status')} aria-label="观看状态"><option>想看</option><option>在看</option><option>看过</option></select>
      </div>
      <button type="submit" disabled={formBusy}>{editing ? '保存影片修改' : '加入影架'}</button>
      {editing && <div className="movie-edit-actions">
        <button type="button" disabled={formBusy} onClick={cancelEdit}>取消编辑</button>
        <button type="button" disabled={formBusy} onClick={deleteMovie}>删除影片</button>
      </div>}
      {error && <p role="alert">{error}</p>}
      {doubanMessage && <p role="status">{doubanMessage}</p>}
    </form>
    <div className="movie-filters" aria-label="影片筛选">
      {groups.map(({ key, label, options, selected }) => <label key={key}>
        {label}
        <select value={selected} onChange={(event) => {
          const value = event.target.value;
          setFilters((current) => ({ ...current, [key]: value }));
        }}>
          <option value="">全部</option>
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>)}
    </div>
    {movies.length > 0 && visibleMovies.length === 0 && <p role="status">没有符合筛选条件的影片。</p>}
    <div className="movie-posters">
      {visibleMovies.map((movie) => {
        const title = movie.title || '待补充片名';
        const destination = httpUrl(movie.url || '')?.href;
        const posterContent = <>
          <span className="movie-poster-placeholder">暂无海报</span>
          {movie.poster && <img key={localPosters[movie.poster] || movie.poster} src={localPosters[movie.poster] || movie.poster} referrerPolicy="no-referrer" alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}
        </>;
        return <article className="movie-tile" key={movie.id}>
          <div className="movie-poster">
            {destination
              ? <a className="movie-poster-link" href={destination} target="_blank" rel="noreferrer" aria-label={`打开${title}`}>{posterContent}</a>
              : posterContent}
            <button className="movie-edit" type="button" disabled={formBusy} aria-label={`编辑${movie.title || '影片'}`} onClick={() => editMovie(movie)}>编辑</button>
            <select className="movie-status" aria-label={`${movie.title || '影片'}观看状态`} value={movie.status || '想看'}
              disabled={editing === movie.id} onChange={(event) => {
                const status = event.target.value;
                persist(movies.map((item) => item.id === movie.id ? { ...item, status } : item));
              }}>
              <option>想看</option><option>在看</option><option>看过</option>
            </select>
          </div>
          <div className="movie-caption">
            <h3>{destination ? <a href={destination} target="_blank" rel="noreferrer">{title}</a> : title}</h3>
            {movie.score && (movie.douban
              ? <a className="movie-score" href={movie.douban} target="_blank" rel="noreferrer" aria-label={`豆瓣评分 ${movie.score}`}>{movie.score}</a>
              : <span className="movie-score">{movie.score}</span>)}
            {(splitMovieRegions(movie.region).length > 0 || movie.genres?.length > 0) &&
              <p>{[splitMovieRegions(movie.region).join(' / '), (movie.genres ?? []).join(' / ')].filter(Boolean).join(' · ')}</p>}
          </div>
        </article>;
      })}
    </div>
  </FeaturePanel>;
}

export { MusicPlayer, MovieCollection };

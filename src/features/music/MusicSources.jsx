import { translate, translateError, translateFixedText } from '../../i18n/index.js';
import { WorkspaceActions } from '../ui.jsx';
import { textMatches } from '../../search/searchCore.js';
import { useEffect, useState } from 'react';

export const musicPlatformNames = { qq: 'QQ 音乐', netease: '网易云音乐', spotify: 'Spotify' };

export async function musicRequest(provider, action, input) {
  const request = window.cyberStudy?.music;
  if (!request) throw new Error(translate("i18n.openTheCyberStudyDesktopAppTo"));
  const result = await request(provider, action, input);
  if (result.error) throw Object.assign(new Error(result.error), { retryable: result.retryable });
  return result;
}

function SourceAccount({ provider, onImport, importing, search }) {
  const name = translateFixedText(musicPlatformNames[provider]);
  const [user, setUser] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [selected, setSelected] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [qr, setQr] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [failures, setFailures] = useState([]);
  const visiblePlaylists=playlists.filter(list=>(!search?.filters?.provider||search.filters.provider===provider)&&textMatches([list.title],search?.query??''));

  const loadPlaylists = async () => {
    const { playlists: list } = await musicRequest(provider, 'playlists');
    setPlaylists(list);
    setSelected(current => list.some(item => item.id === current) ? current : list[0]?.id ?? '');
  };

  const run = async task => {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (failure) {
      setStatus('');
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    setBusy(true);
    (async () => {
      const { user: account } = await musicRequest(provider, 'account');
      if (!active || !account) return;
      setUser(account);
      const { playlists: list } = await musicRequest(provider, 'playlists');
      if (!active) return;
      setPlaylists(list);
      setSelected(list[0]?.id ?? '');
    })().catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [provider]);

  useEffect(() => {
    if (!qr) return;
    let active = true;
    let timer;
    const poll = async () => {
      try {
        const { status: result } = await musicRequest(provider, 'qr-check');
        if (!active) return;
        if (result === 'confirmed') {
          const { user: account } = await musicRequest(provider, 'account');
          if (!active) return;
          if (!account) throw new Error(translate("i18n.theServiceConfirmedTheScanButReturned"));
          setUser(account);
          setQr(null);
          setStatus('');
          await run(loadPlaylists);
          return;
        }
        if (result === 'expired') {
          setStatus(translate("i18n.theQrCodeHasExpiredGenerateA"));
          setQr(null);
          return;
        }
        setStatus(provider === 'spotify' ? translate("i18n.waitingForSpotifyPairing") : result === 'scanned' ? translate("i18n.confirmSignInOnYourPhone") : '');
        timer = setTimeout(poll, 2000);
      } catch (failure) {
        if (!active) return;
        setError(failure.message);
        setQr(null);
      }
    };
    timer = setTimeout(poll, 2000);
    return () => { active = false; clearTimeout(timer); };
  }, [provider, qr]);

  const start = type => run(async () => {
    setQr(null);
    setStatus('');
    setPairCode('');
    const { image, code, status: result } = await musicRequest(provider, 'qr-start', { type });
    if (result === 'confirmed') {
      const { user: account } = await musicRequest(provider, 'account');
      setUser(account);
      await loadPlaylists();
      return;
    }
    setPairCode(code || '');
    if (!image) throw new Error(translate("i18n.couldNotGenerateTheQrCodeTry"));
    setQr(image);
  });

  const importPlaylist = () => run(async () => {
    const list = playlists.find(item => item.id === selected);
    if (!list) return;
    setStatus('');
    setFailures([]);
    if (provider === 'spotify') {
      setStatus(translate("i18n.readingSpotifyPlaylists"));
      const { tracks, pending } = await musicRequest(provider, 'tracks', { id: selected });
      onImport(provider, list, tracks);
      setStatus(translate("i18n.synced0SpotifyTracksForOnlinePlayback", tracks.length, pending ? `另有 ${pending} 首资料暂未返回，可稍后重新同步。` : ''));
      return;
    }
    // The development page can reload while the desktop process is still on the old version.
    const capability = await window.cyberStudy?.music?.(provider, 'cache-status');
    if (!capability?.supported) throw new Error(translate("i18n.playlistCachingIsUnavailableInThisSession"));
    const { tracks } = await musicRequest(provider, 'tracks', { id: selected });
    const task = onImport(provider, list, tracks);
    const ready = [];
    const failed = [];
    let reused = 0;
    try {
      for (const [index, track] of tracks.entries()) {
        setProgress({ done: index, total: tracks.length, title: track.title });
        try {
          const result = await musicRequest(provider, 'cache-track', {
            id: track.sourceId, mediaMid: track.mediaMid, fee: track.fee,
          });
          const cached = { ...track, cachedUrl: result.cachedUrl };
          ready.push(cached);
          task.update(cached, 'ready');
          if (result.reused) reused++;
        } catch (failure) {
          failed.push({ id: track.sourceId, title: track.title, reason: failure.message });
          task.update(track, 'failed');
        }
      }
      setFailures(failed);
      setStatus(tracks.length
        ? translate("i18n.imported01TracksIncluding2Already", ready.length, tracks.length, reused)
        : translate("i18n.thisPlaylistHasNoTracks"));
    } finally {
      task.finish();
      setProgress(null);
    }
  });

  const logout = () => run(async () => {
    await musicRequest(provider, 'logout');
    setQr(null);
    setUser(null);
    setPlaylists([]);
    setSelected('');
    setStatus('');
    setFailures([]);
  });

  return (
    <div className="music-source-account">
      {user ? (
        <>
          <p>{user.name}</p>
          <div className="card-actions">
            <button type="button" disabled={busy} onClick={() => run(loadPlaylists)}>{translate("i18n.refreshPlaylists")}</button>
            <button type="button" disabled={busy || importing} onClick={logout}>{translate("i18n.signOut")}</button>
          </div>
          {playlists.length > 0 && (
            <div className="music-playlist-picker">
              <div className="music-platform-list" role="radiogroup" aria-label={translate("i18n.0Playlists", name)}>
                {visiblePlaylists.map(list=><label key={list.id}><input type="radio" name={`platform-playlist-${provider}`} value={list.id} checked={selected===list.id} disabled={busy} onChange={()=>{setSelected(list.id);setStatus('');setFailures([]);}}/><span>{list.title}</span></label>)}

              </div>
              <WorkspaceActions><button type="button" disabled={busy || importing || !visiblePlaylists.some(list=>list.id===selected)} onClick={importPlaylist}>{translate("i18n.importToRecordShelf")}</button></WorkspaceActions>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card-actions">
            <button type="button" disabled={busy} onClick={() => start('qq')}>{provider === 'qq' ? translate("i18n.scanWithQq") : provider === 'spotify' ? translate("i18n.scanForSpotify") : translate("i18n.scanWithNetease")}</button>
            {provider === 'qq' && <button type="button" disabled={busy} onClick={() => start('wx')}>{translate("i18n.scanWithWechat")}</button>}
          </div>
          {qr && <img className="music-login-qr" src={qr} alt={translate("i18n.0SignInQrCode", name)} />}
          {qr && pairCode && <div className="stack-form">
            <p>{translate("i18n.spotifyPairingCode")}{' '}<strong>{pairCode}</strong></p>
            <button type="button" onClick={() => run(() => musicRequest('spotify', 'pair-open'))}>{translate("i18n.pairInBrowser")}</button>
          </div>}
        </>
      )}
      {progress ? (
        <div className="music-cache-progress">
          <progress aria-label={translate("i18n.playlistCachingProgress")} value={progress.done} max={progress.total} />
          <p role="status">{translate("i18n.caching")}{' '}{progress.done + 1}/{progress.total} · {progress.title}</p>
        </div>
      ) : busy && <p role="status">{translate("i18n.connectingTo", name)}</p>}
      {failures.length > 0 && (
        <details className="music-cache-failures">
          <summary>{failures.length}{' '}{translate("i18n.tracksSkipped")}</summary>
          <ul>{failures.map((item, index) => <li key={`${item.id}:${index}`}>{item.title} · {translateError(item.reason)}</li>)}</ul>
        </details>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{translateError(error)}</p>}
    </div>
  );
}

export function MusicSources({ onImport, importing, search }) {
  const [provider, setProvider] = useState('');
  return (
    <section className="music-sources" aria-label={translate("i18n.onlineMusic")}>
      <div className="card-actions">
        {Object.entries(musicPlatformNames).map(([id, name]) => (
          <button key={id} type="button" disabled={importing} aria-expanded={provider === id}
            onClick={() => setProvider(current => current === id ? '' : id)}>{translateFixedText(name)}</button>
        ))}
      </div>
      {provider && <SourceAccount key={provider} provider={provider} onImport={onImport} importing={importing} search={search} />}
    </section>
  );
}

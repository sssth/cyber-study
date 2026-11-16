import { useEffect, useState } from 'react';

export const musicPlatformNames = { qq: 'QQ 音乐', netease: '网易云音乐' };

export async function musicRequest(provider, action, input) {
  const request = window.cyberStudy?.music;
  if (!request) throw new Error('请在赛博书房桌面应用中连接音乐账号。');
  const result = await request(provider, action, input);
  if (result.error) throw Object.assign(new Error(result.error), { retryable: result.retryable });
  return result;
}

function SourceAccount({ provider, onImport, importing }) {
  const name = musicPlatformNames[provider];
  const [user, setUser] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [selected, setSelected] = useState('');
  const [qr, setQr] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [failures, setFailures] = useState([]);

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
          if (!account) throw new Error('扫码已确认，但平台未返回账号，请重新扫码。');
          setUser(account);
          setQr(null);
          setStatus('');
          await run(loadPlaylists);
          return;
        }
        if (result === 'expired') {
          setStatus('二维码已过期，请重新生成。');
          setQr(null);
          return;
        }
        setStatus(result === 'scanned' ? '请在手机上确认登录。' : '');
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
    const { image } = await musicRequest(provider, 'qr-start', { type });
    if (!image) throw new Error('二维码未生成，请重试。');
    setQr(image);
  });

  const importPlaylist = () => run(async () => {
    const list = playlists.find(item => item.id === selected);
    if (!list) return;
    setStatus('');
    setFailures([]);
    // The development page can reload while the desktop process is still on the old version.
    const capability = await window.cyberStudy?.music?.(provider, 'cache-status');
    if (!capability?.supported) throw new Error('当前桌面程序尚未加载歌单缓存功能。请按 ⌘Q 完全退出书房，再重新启动。');
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
        ? `已导入 ${ready.length}/${tracks.length} 首，其中 ${reused} 首使用已有缓存。`
        : '这张歌单没有曲目。');
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
            <button type="button" disabled={busy} onClick={() => run(loadPlaylists)}>刷新歌单</button>
            <button type="button" disabled={busy || importing} onClick={logout}>退出登录</button>
          </div>
          {playlists.length > 0 && (
            <div className="music-playlist-picker">
              <select aria-label={`${name}个人歌单`} value={selected} onChange={event => { setSelected(event.target.value); setStatus(''); setFailures([]); }} disabled={busy}>
                {playlists.map(list => <option key={list.id} value={list.id}>{name} · {list.title}</option>)}
              </select>
              <button type="button" disabled={busy || importing || !selected} onClick={importPlaylist}>导入唱片架</button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card-actions">
            <button type="button" disabled={busy} onClick={() => start('qq')}>{provider === 'qq' ? 'QQ 扫码' : '网易云扫码'}</button>
            {provider === 'qq' && <button type="button" disabled={busy} onClick={() => start('wx')}>微信扫码</button>}
          </div>
          {qr && <img className="music-login-qr" src={qr} alt={`${name}登录二维码`} />}
        </>
      )}
      {progress ? (
        <div className="music-cache-progress">
          <progress aria-label="缓存歌单进度" value={progress.done} max={progress.total} />
          <p role="status">正在缓存 {progress.done + 1}/{progress.total} · {progress.title}</p>
        </div>
      ) : busy && <p role="status">正在连接{name}…</p>}
      {failures.length > 0 && (
        <details className="music-cache-failures">
          <summary>{failures.length} 首未导入</summary>
          <ul>{failures.map((item, index) => <li key={`${item.id}:${index}`}>{item.title} · {item.reason}</li>)}</ul>
        </details>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function MusicSources({ onImport, importing }) {
  const [provider, setProvider] = useState('');
  return (
    <section className="music-sources" aria-label="在线音乐">
      <div className="card-actions">
        {Object.entries(musicPlatformNames).map(([id, name]) => (
          <button key={id} type="button" disabled={importing} aria-expanded={provider === id}
            onClick={() => setProvider(current => current === id ? '' : id)}>{name}</button>
        ))}
      </div>
      {provider && <SourceAccount key={provider} provider={provider} onImport={onImport} importing={importing} />}
    </section>
  );
}

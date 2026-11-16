import MemoryEditor from './globe/MemoryEditor.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FeaturePanel, EmptyState } from './ui.jsx';
import GlobeBrowser from './globe/GlobeBrowser.jsx';

const api = (action, input) => window.cyberStudy.globe(action, input);
export default function GlobePanel({ onClose }) {
  const [photos, setPhotos] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [editorVersion, setEditorVersion] = useState(0);
  const [initialPoint, setInitialPoint] = useState(null);
  const [journeyId, setJourneyId] = useState('');
  const [mode, setMode] = useState('browse');
  const [viewerPhotos, setViewerPhotos] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [report, setReport] = useState([]);
  const [progress, setProgress] = useState(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [batchDelete, setBatchDelete] = useState(false);
  const [viewId, setViewId] = useState(null);
  const closeViewer = useRef(null), returnFocus = useRef(null), initialized = useRef(false);
  const desktop = Boolean(window.cyberStudy?.globe);
  const request = async (action, input) => {
    setBusy(true); setError(''); setMessage(''); setProgress(null);
    try {
      const result = await api(action, input);
      if (result.error) throw new Error(result.error);
      if (result.photos) setPhotos(result.photos);
      if (result.journeys) setJourneys(result.journeys);
      if (!result.canceled && ['point', 'journey'].includes(action)) setMessage('已保存。');
      if (result.report) { setReport(result.report); if (!result.report.length) setMessage('没有找到可导入的照片。支持 JPEG、PNG、WebP；HEIC 取决于系统解码能力。'); }
      return result;
    } catch (err) { setError(err.message || '操作失败，请重试。'); return null; }
    finally { setBusy(false); setProgress(null); }
  };
  useEffect(() => {
    if (!desktop) { setBusy(false); return; }
    const unsubscribe = window.cyberStudy.onGlobeProgress(setProgress);
    if (!initialized.current) { initialized.current = true; request('list'); }
    return unsubscribe;
  }, []);
  const active = photos.filter(p => !p.deletedAt);
  const filtered = useMemo(() => photos.filter(p => !p.deletedAt && [p.location, p.caption, p.date, p.filename, p.country, p.region, p.city].some(v => String(v || '').toLowerCase().includes(query.trim().toLowerCase()))).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt).localeCompare(String(a.createdAt))), [photos, query]);
  const viewerSequence = (viewerPhotos || filtered).filter(p => p.photo);
  const viewIndex = viewerSequence.findIndex(p => p.id === viewId), viewed = viewerSequence[viewIndex];
  const dismiss = () => { setViewId(null); setViewerPhotos(null); returnFocus.current?.focus(); };
  const move = direction => { if (viewerSequence.length) setViewId(viewerSequence[(viewIndex + direction + viewerSequence.length) % viewerSequence.length].id); };
  useEffect(() => { if (viewId) closeViewer.current?.focus(); }, [viewId]);
  useEffect(() => {
    if (!viewed) return;
    const handler = event => {
      if (!['Escape', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) return;
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
  const editPoint = point => {
    setSelected([]);
    setBatchDelete(false);
    setInitialPoint(point);
    setEditorVersion(value => value + 1);
  };
  const deletePoints = async ids => {
    if (!ids.length || !window.confirm(`删除这 ${ids.length} 个记忆点？`)) return;
    const result = await request('update', { ids, patch: { deletedAt: true } });
    if (result && !result.canceled) {
      setInitialPoint(null); setSelected([]); setBatchDelete(false);
      setMessage(`已删除 ${ids.length} 个记忆点。`);
    }
  };
  const toggleSelected = id => setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  return <FeaturePanel wide title="地球仪" kicker="Memory Globe" description="用照片或文字记录记忆，添加地点后即可在地球上查看。" onClose={() => { if (!busy) onClose(); }}>
    {!desktop ? <EmptyState>请通过桌面应用打开地球仪。本地照片导入需要桌面文件访问能力。</EmptyState> : <>
      <div className="globe-mode-switch" aria-label="地球仪模式">{[['browse', '3D 浏览'], ['point', '记忆点'], ['journey', '旅程']].map(([value, title]) => <button key={value} disabled={busy} aria-pressed={mode === value} onClick={() => { if (value !== mode) { setBatchDelete(false); setSelected([]); setInitialPoint(null); setMode(value); } }}>{title}</button>)}</div>
      {mode === 'point' && <div className="globe-toolbar">
        <button disabled={busy} onClick={() => request('import', { folder: false })}>导入照片</button>
        <button disabled={busy} onClick={() => request('import', { folder: true })}>导入文件夹</button>
        <button disabled={busy} onClick={() => editPoint({})}>新建记忆点</button>
      </div>}
      {mode === 'point' && <p className="card-meta">共 {active.length} 个记忆点</p>}
      {busy && <p role="status">{progress ? `正在导入 ${progress.done} / ${progress.total}：${progress.name}` : '正在处理，请稍候…'}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p role="status" className="globe-caption">{message}</p>}
      {mode === 'journey' && <MemoryEditor initialPoint={initialPoint} key={mode} mode={mode} photos={photos} journeys={journeys} busy={busy} request={request} onView={id => { setJourneyId(id); setMode('browse'); }} />}
      {mode === 'browse' && <GlobeBrowser journeys={journeys} journeyId={journeyId} setJourneyId={setJourneyId} photos={photos} loading={busy} onOrganize={photo => { setInitialPoint(photo || null); setMode('point'); }} onOpenPhoto={(photo, sequence) => { returnFocus.current = document.activeElement; setViewerPhotos(sequence); setViewId(photo.id); }} />}
      {mode === 'point' && <>
      {report.length > 0 && <details className="globe-import-report" open><summary>导入报告：{report.filter(r => r.status === '成功').length} 成功，{report.filter(r => r.status === '失败').length} 失败，{report.filter(r => !['成功', '失败'].includes(r.status)).length} 跳过</summary><ul>{report.map((r, i) => <li key={i}>{r.name} — {r.status}{r.reason ? `：${r.reason}` : ''}</li>)}</ul></details>}
      <div className="globe-library-layout memory-library-layout">
        <section>
          <label className="globe-search">搜索记忆点<input type="search" value={query} onChange={e => { setQuery(e.target.value); setSelected([]); }} placeholder="地点、日期、说明或文件名" /></label>
          <div className="globe-toolbar">
            <button disabled={busy || (!batchDelete && !filtered.length)} onClick={() => { setBatchDelete(value => !value); setSelected([]); setInitialPoint(null); }}>{batchDelete ? '退出批量删除' : '批量删除'}</button>
            {batchDelete && <>
              <button disabled={busy || !filtered.length} onClick={() => setSelected(filtered.map(p => p.id))}>全选当前列表</button>
              <button disabled={busy || !selected.length} onClick={() => deletePoints(selected)}>删除选中（{selected.length}）</button>
            </>}
          </div>
          <div className="globe-photo-grid">{filtered.map(p => <article className={`admin-card memory-point-card ${selected.includes(p.id) ? 'globe-selected' : ''}`} key={p.id}>
            <button type="button" className="memory-card-edit" disabled={busy} onClick={() => batchDelete ? toggleSelected(p.id) : editPoint(p)} aria-pressed={batchDelete ? selected.includes(p.id) : undefined} aria-label={`${batchDelete ? '选择记忆点' : '编辑记忆点'}：${p.location || p.filename || '未命名记忆'}`} />
            {p.thumbnail && <button className="globe-photo-button" onClick={event => { returnFocus.current = event.currentTarget; setViewId(p.id); }} aria-label={`查看 ${p.location || p.filename || '照片'}`}><img loading="lazy" className="preview-image" src={p.thumbnail} alt={p.location || '记忆照片'} /></button>}
            {batchDelete && <span className="card-meta">{selected.includes(p.id) ? '✓ 已选中' : '点击卡片选择'}</span>}
            <h3>{p.location || '地点待填写'}</h3>
            <p className="card-meta">{p.date || '日期未知'}{p.dateSource === 'legacy-unconfirmed' && p.date ? '（旧日期待核实）' : ''} · {p.visitStatus === 'wish' ? '想去' : '去过'}</p>
            <p className="globe-caption">{p.caption}</p>
          </article>)}</div>
          {!filtered.length && <EmptyState>{query ? '没有匹配的记忆点。' : '还没有记忆点，可以导入照片、导入文件夹或新建记忆点。'}</EmptyState>}
        </section>
        {initialPoint ? <MemoryEditor key={editorVersion} mode="point" initialPoint={initialPoint} photos={photos} journeys={journeys} busy={busy} request={request} onSaved={() => { setInitialPoint(null); setQuery(''); }} onDelete={id => deletePoints([id])} /> : <aside className="globe-organizer">
          <h3>{batchDelete ? '批量删除' : '记忆点'}</h3>
          <p className="card-meta">{batchDelete ? '点击卡片选择要删除的记忆点，再点击删除选中。' : '点击一张卡片编辑记忆，或新建一个记忆点。修改后点击保存，切换卡片会放弃未保存的修改。'}</p>
        </aside>}
      </div>
      </>}
    </>}
    {viewed && <div className="globe-photo-viewer" role="dialog" aria-modal="true" aria-label="照片浏览">
      <button ref={closeViewer} onClick={dismiss}>关闭照片（Esc）</button><img src={viewed.photo} alt={viewed.location || '记忆照片'} />
      <p>{viewed.location || '地点待填写'} · {viewed.date || '日期未知'} · {viewIndex + 1} / {viewerSequence.length}</p><p className="globe-caption">{viewed.caption}</p>
      <div><button disabled={viewerSequence.length < 2} onClick={() => move(-1)}>上一张 ←</button><button disabled={viewerSequence.length < 2} onClick={() => move(1)}>下一张 →</button></div>
    </div>}
  </FeaturePanel>;
}

import { ContentCommand, ContentEditButton } from './ContentCommands.jsx';
import {useSearchCount,useSearchScope,SearchStatus,dateFilters} from '../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../search/searchCore.js';
import ContentActions from './ContentActions.jsx';
import MemoryEditor from './globe/MemoryEditor.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionWorkspace, FeaturePanel, EmptyState } from './ui.jsx';
import GlobeBrowser from './globe/GlobeBrowser.jsx';

const api = (action, input) => window.cyberStudy.globe(action, input);
export default function GlobePanel({ onClose, navigationItem }) {
  const searchTarget = ['journey', 'memory_point'].includes(navigationItem?.type) ? navigationItem : null;
  const [photos, setPhotos] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [editorVersion, setEditorVersion] = useState(0);
  const [initialPoint, setInitialPoint] = useState(null);
  const createReturnMode = useRef(null);
  const [journeyId, setJourneyId] = useState('');
  const [mode, setMode] = useState(searchTarget?.type==='journey'?'journey':searchTarget?'point':'browse');
  const [viewerPhotos, setViewerPhotos] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [report, setReport] = useState([]);
  const [progress, setProgress] = useState(null);
  const search=useSearchScope({id:mode==='journey'?'journey':'globe',label:mode==='journey'?'旅途':'记忆点',priority:10,filters:[...dateFilters,...(mode==='journey'?[]:[{key:'status',label:'足迹状态',options:[['visited','去过'],['wish','想去']]}])]});
  const query=search.query;
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
  const filtered = useMemo(() => photos.filter(p => matchesItem('memory_point',p,search)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt).localeCompare(String(a.createdAt))), [photos, search]);
  useSearchCount(mode==='journey'?'journey':'globe',busy?null:mode==='journey'?journeys.filter(j=>matchesItem('journey',j,search)).length:filtered.length);
  const viewerSequence = (viewerPhotos || filtered).filter(p => p.photo);
  const viewIndex = viewerSequence.findIndex(p => p.id === viewId), viewed = viewerSequence[viewIndex];
  const dismiss = () => { setViewId(null); setViewerPhotos(null); returnFocus.current?.focus(); };
  const move = direction => { if (viewerSequence.length) setViewId(viewerSequence[(viewIndex + direction + viewerSequence.length) % viewerSequence.length].id); };
  useEffect(() => { if (viewId) closeViewer.current?.focus(); }, [viewId]);
  useEffect(() => {
    if (!viewed) return;
    const handler = event => {
      if (document.querySelector('dialog[open]') || !['Escape', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) return;
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
      {mode === 'point' && initialPoint && !initialPoint.id && <ContentCommand kind="cancel-create" label="取消新建记忆点" disabled={busy} run={() => {
        setInitialPoint(null); setMode(createReturnMode.current || 'point'); createReturnMode.current = null;
      }} />}
      <ContentCommand kind="create" label="新建记忆点" disabled={busy} run={() => { createReturnMode.current = mode; setMode('point'); editPoint({}); }} />
      <ActionWorkspace disabled={busy} label="导入照片" title="添加记忆"><div className="globe-toolbar">
        <button disabled={busy} onClick={() => request('import', { folder: false })}>导入照片</button>
        <button disabled={busy} onClick={() => request('import', { folder: true })}>导入文件夹</button>
      </div></ActionWorkspace>
      {mode === 'point' && <p className="card-meta">共 {active.length} 个记忆点</p>}
      <SearchStatus id={mode==='journey'?'journey':'globe'} label={mode==='journey'?'旅途':'记忆点'}/>
      {busy && <p role="status">{progress ? `正在导入 ${progress.done} / ${progress.total}：${progress.name}` : '正在处理，请稍候…'}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p role="status" className="globe-caption">{message}</p>}
      {mode === 'journey' && <MemoryEditor initialPoint={initialPoint} key={mode} mode={mode} photos={photos} journeys={journeys} searchState={search} busy={busy} request={request} onView={id => { setJourneyId(id); setMode('browse'); }} />}
      {mode === 'browse' && <GlobeBrowser journeys={journeys} journeyId={journeyId} setJourneyId={setJourneyId} photos={filtered} loading={busy} onOrganize={photo => { setInitialPoint(photo || null); setMode('point'); }} onOpenPhoto={(photo, sequence) => { returnFocus.current = document.activeElement; setViewerPhotos(sequence); setViewId(photo.id); }} />}
      {mode === 'point' && <>
      {report.length > 0 && <details className="globe-import-report" open><summary>导入报告：{report.filter(r => r.status === '成功').length} 成功，{report.filter(r => r.status === '失败').length} 失败，{report.filter(r => !['成功', '失败'].includes(r.status)).length} 跳过</summary><ul>{report.map((r, i) => <li key={i}>{r.name} — {r.status}{r.reason ? `：${r.reason}` : ''}</li>)}</ul></details>}
      <div className="globe-library-layout memory-library-layout">
        <section>
          <div className="globe-toolbar">
            {batchDelete ? <button onClick={() => { setBatchDelete(false); setSelected([]); }}>取消选择</button>
              : <ContentEditButton label="批量删除记忆点" disabled={busy || !filtered.length}
                run={() => { setBatchDelete(true); setSelected([]); setInitialPoint(null); }} />}
            {batchDelete && <>
              <button disabled={busy || !filtered.length} onClick={() => setSelected(filtered.map(p => p.id))}>全选当前列表</button>
              <ContentEditButton label={`删除选中的 ${selected.length} 个记忆点`} disabled={busy || !selected.length} run={() => deletePoints(selected)} />
            </>}
          </div>
          <div className="globe-photo-grid">{filtered.map(p => <article className={`admin-card memory-point-card ${selected.includes(p.id) ? 'globe-selected' : ''}`} key={p.id}>
            {batchDelete ? <button type="button" className="memory-card-edit" disabled={busy}
              onClick={() => toggleSelected(p.id)} aria-pressed={selected.includes(p.id)} aria-label={`选择记忆点：${p.location || p.filename || '未命名记忆'}`} />
              : <>
                <ContentCommand label={`编辑记忆点 · ${p.location || p.filename || '未命名记忆'}`} disabled={busy} run={() => editPoint(p)} />
                <ContentCommand label={`删除记忆点 · ${p.location || p.filename || '未命名记忆'}`} disabled={busy} run={() => deletePoints([p.id])} />
              </>}
            {p.thumbnail && <button data-item-open className="globe-photo-button" onClick={event => { returnFocus.current = event.currentTarget; setViewId(p.id); }} aria-label={`查看 ${p.location || p.filename || '照片'}`}><img loading="lazy" className="preview-image" src={p.thumbnail} alt={p.location || '记忆照片'} /></button>}
            {batchDelete && <span className="card-meta">{selected.includes(p.id) ? '✓ 已选中' : '未选中'}</span>}
            <h3>{p.location || '地点待填写'}</h3>
            <p className="card-meta">{p.date || '日期未知'}{p.dateSource === 'legacy-unconfirmed' && p.date ? '（旧日期待核实）' : ''} · {p.visitStatus === 'wish' ? '想去' : '去过'}</p>
            <p className="globe-caption">{p.caption}</p><ContentActions type="memory_point" id={p.id} title={p.location}/>
          </article>)}</div>
          {!filtered.length && <EmptyState>{query ? '没有匹配的记忆点。' : '暂无记忆点。'}</EmptyState>}
        </section>
        {initialPoint ? <MemoryEditor key={editorVersion} mode="point" initialPoint={initialPoint} photos={photos} journeys={journeys} busy={busy} request={request} onSaved={() => { setInitialPoint(null); }} onDelete={id => deletePoints([id])} /> : <aside className="globe-organizer">
          <h3>{batchDelete ? '批量删除' : '记忆点'}</h3>

        </aside>}
      </div>
      </>}
    </>}
    {viewed && <div className="globe-photo-viewer" role="dialog" aria-modal="true" aria-label="照片浏览">
      <ContentCommand label="编辑记忆点" run={() => { dismiss(); editPoint(viewed); }} /><ContentActions surface=".globe-photo-viewer" type="memory_point" id={viewed.id} title={viewed.location} preview={false}/>
      <button ref={closeViewer} onClick={dismiss}>关闭照片（Esc）</button><img src={viewed.photo} alt={viewed.location || '记忆照片'} />
      <p>{viewed.location || '地点待填写'} · {viewed.date || '日期未知'} · {viewIndex + 1} / {viewerSequence.length}</p><p className="globe-caption">{viewed.caption}</p>
      <div><button disabled={viewerSequence.length < 2} onClick={() => move(-1)}>上一张 ←</button><button disabled={viewerSequence.length < 2} onClick={() => move(1)}>下一张 →</button></div>
    </div>}
  </FeaturePanel>;
}

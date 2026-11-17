import { useEffect, useState } from 'react';
import { frameProfiler } from '../scenes/three/frameProfiler.js';

function formatMs(value) {
  return value === null || value === undefined ? '—' : `${value} ms`;
}

export default function ProfilerHud({ forceAlwaysRender, onToggleAlwaysRender, quality }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(() => frameProfiler.summarize(60));
  const [userTiming, setUserTiming] = useState(frameProfiler.userTiming);
  const [traceState, setTraceState] = useState({ allowed: false, recording: false, lastFile: '' });
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const api = globalThis.cyberStudy?.profiler;
    let disposeTrace = null;
    let disposeHud = null;

    if (api) {
      api.getStatus?.().then((status) => {
        if (status) setTraceState(status);
      }).catch(() => {});
      disposeTrace = api.onTraceState?.((next) => {
        setTraceState(next);
        frameProfiler.setUserTiming(Boolean(next.recording));
        setUserTiming(Boolean(next.recording));
        if (next.recording) setStatusMessage('正在录制 Perfetto Trace (F10 停止)…');
        else if (next.lastFile) setStatusMessage(`Trace 已保存: ${next.lastFile}`);
      });
      disposeHud = api.onToggleHud?.(() => setOpen((current) => !current));
    }

    const onKeyDown = (event) => {
      if (!api && import.meta.env.DEV && event.key === 'F9' && !event.repeat) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    if (typeof window !== 'undefined' && window.cyberStudyProfiler) {
      window.cyberStudyProfiler.toggleHud = () => setOpen((current) => !current);
    }

    return () => {
      disposeTrace?.();
      disposeHud?.();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open && !traceState.recording) return;
    const release = frameProfiler.retain();
    if (!open) return release;

    setSummary(frameProfiler.summarize(60));
    const timer = setInterval(() => {
      setSummary(frameProfiler.summarize(60));
    }, 400);
    return () => {
      clearInterval(timer);
      release();
    };
  }, [open, traceState.recording]);

  const api = globalThis.cyberStudy?.profiler;
  const maxStageMs = Math.max(1, ...summary.stages.map((stage) => stage.avgMs));

  const toggleUserTiming = (checked) => {
    frameProfiler.setUserTiming(checked);
    setUserTiming(checked);
  };

  const handleTrace5s = async () => {
    if (!api) return;
    const res = await api.startTrace({ durationMs: 5000 });
    if (!res?.ok) setStatusMessage(res?.error || '启动 Trace 失败');
  };

  const handleToggleTrace = async () => {
    if (!api) return;
    const res = traceState.recording ? await api.stopTrace() : await api.startTrace();
    if (!res?.ok) setStatusMessage(res?.error || 'Trace 操作失败');
  };

  const handleSaveReport = async () => {
    if (!api) return;
    const res = await api.saveReport({
      quality,
      forceAlwaysRender,
      profiler: frameProfiler.snapshot()
    });
    if (res?.ok) setStatusMessage(`报告已导出: ${res.filePath}`);
    else setStatusMessage(res?.error || '导出失败');
  };

  return (
    <>
      {!open && (traceState.recording || statusMessage) && (
        <div className="profiler-toast" role="status">
          <span>{traceState.recording ? '● 正在录制 Trace (F10 停止)' : statusMessage}</span>
          {!traceState.recording && (
            <button type="button" onClick={() => setStatusMessage('')}>×</button>
          )}
        </div>
      )}

      {open && (
        <aside className="profiler-hud" aria-label="性能剖析面板">
          <header className="profiler-hud-header">
            <strong>Profiler HUD (F9)</strong>
            <div className="profiler-hud-actions">
              <label>
                <input type="checkbox" checked={forceAlwaysRender} onChange={(e) => onToggleAlwaysRender(e.target.checked)} />
                持续渲染
              </label>
              <label>
                <input type="checkbox" checked={userTiming} onChange={(e) => toggleUserTiming(e.target.checked)} />
                UserTiming
              </label>
              <button type="button" onClick={() => { frameProfiler.reset(); setSummary(frameProfiler.summarize(60)); }}>重置</button>
              <button type="button" onClick={() => setOpen(false)}>收起</button>
            </div>
          </header>

          <div className="profiler-kpis">
            <div><span>FPS</span><strong>{summary.fps || '—'}</strong></div>
            <div><span>P50 / P95 / P99</span><strong>{summary.p50Ms ?? '—'} / {summary.p95Ms ?? '—'} / {summary.p99Ms ?? '—'} ms</strong></div>
            <div><span>CPU 帧耗时</span><strong>{formatMs(summary.avgCpuFrameMs)}</strong></div>
            <div><span>GPU 耗时</span><strong>{summary.gpuSupported ? formatMs(summary.avgGpuMs) : '不支持'}</strong></div>
          </div>

          <section className="profiler-stages">
            <h3>阶段耗时（近 {summary.frameCount} 帧均值 / 峰值）</h3>
            {summary.stages.length === 0 ? (
              <p className="profiler-empty">暂无采样帧（可拖动视角或开启「持续渲染」）</p>
            ) : (
              <ul>
                {summary.stages.map((stage) => (
                  <li key={stage.name}>
                    <span className="stage-name">{stage.name}</span>
                    <span className="stage-bar-wrap">
                      <span className="stage-bar" style={{ width: `${Math.min(100, (stage.avgMs / maxStageMs) * 100)}%` }} />
                    </span>
                    <span className="stage-val">{stage.avgMs} / {stage.maxMs} ms</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="profiler-counters">
            <span>DrawCalls: <strong>{summary.render?.calls ?? '—'}</strong></span>
            <span>Triangles: <strong>{summary.render?.triangles?.toLocaleString() ?? '—'}</strong></span>
            <span>Geometries: <strong>{summary.render?.geometries ?? '—'}</strong></span>
            <span>Textures: <strong>{summary.render?.textures ?? '—'}</strong></span>
            <span>JS Heap: <strong>{summary.heapMb !== null ? `${summary.heapMb} MB` : '—'}</strong></span>
            <span>Cull: <strong>{summary.optimization ? `遮挡${summary.optimization.occluded} / 视锥外${summary.optimization.outside} / 单面${summary.optimization.singleSided}` : '—'}</strong></span>
          </div>

          {api && traceState.allowed && (
            <footer className="profiler-footer">
              <button type="button" onClick={handleToggleTrace}>
                {traceState.recording ? '停止 Trace (F10)' : '开始 Trace (F10)'}
              </button>
              <button type="button" disabled={traceState.recording} onClick={handleTrace5s}>录制 5s</button>
              <button type="button" onClick={handleSaveReport}>导出 JSON 报告</button>
              <button type="button" onClick={() => api.openTraces()}>打开目录</button>
            </footer>
          )}

          {statusMessage && <p className="profiler-status" role="status">{statusMessage}</p>}
        </aside>
      )}
    </>
  );
}

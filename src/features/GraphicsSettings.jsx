import { graphicsOptions, presetSettings, matchingPreset } from '../data/graphics.js';
export default function GraphicsSettings({ quality, onChange, test, result, onTest, onBack, error, live }) {
  const selectedPreset = matchingPreset(quality);
  return <section className="interaction-list shortcut-settings" id="room-interactions" aria-labelledby="graphics-title">
    <header><h2 id="graphics-title">画质与流畅度</h2><button type="button" autoFocus onClick={onBack}>返回菜单</button></header>
    <div className="graphics-preset-row" role="group" aria-label="画质档位">{[['low', '低'], ['medium', '中'], ['high', '高'], ['custom', '自定义']].map(([id, label]) => <button type="button" key={id} aria-pressed={selectedPreset === id} onClick={() => onChange(id === 'custom' ? { ...quality, mode: 'custom' } : presetSettings(id))}>{label}</button>)}</div>
    <p>当前：{({low:'低',medium:'中',high:'高',custom:'自定义'})[selectedPreset]}</p>
    <section className="graphics-details" aria-label="细分设置">
      {graphicsOptions.map(option => <div className="graphics-setting-row" key={option.key}>
        <label htmlFor={`graphics-${option.key}`} title={option.help}>{option.label}</label>
        <select id={`graphics-${option.key}`} value={String(quality[option.key])} onChange={event => {
          const value = option.choices.find(([v]) => String(v) === event.target.value)[0];
          onChange({ ...quality, mode: 'custom', [option.key]: value });
        }}>{option.choices.map(([value, label]) => <option key={String(value)} value={String(value)}>{label}</option>)}</select>
      </div>)}
    </section>
    {error && <p role="status">{error}</p>}
    <section className="interaction-group graphics-status"><h3>实时状态</h3>
      <div className="graphics-metrics">
        <div><span>帧率</span><strong>{!live ? '采样中' : live.hidden ? '后台暂停' : `${live.fps} FPS`}</strong></div>
        <div><span>帧耗时</span><strong>{live && !live.hidden ? `${live.frameMs} ms` : '—'}</strong></div>
        <div><span>流畅度</span><strong>{!live || live.hidden ? '—' : live.fps >= 55 ? '流畅' : live.fps >= 30 ? '一般' : '偏低'}</strong></div>
      </div>
      <button type="button" disabled={test} onClick={onTest}>{test ? '检测中…' : '详细检测'}</button>
      {test && <p role="status">约 10 秒，请保持窗口在前台。</p>}
      {result && <div className="graphics-test-result" role="status">
        <p>平均 {result.fps} FPS · P95 {result.p95} ms{result.p99 ? ` · P99 ${result.p99} ms` : ''}</p>
        <p>CPU 帧 {result.cpuFrameMs ?? '—'} ms · 渲染提交 {result.cpuRenderMs ?? '—'} ms · GPU {result.gpuMs ?? '不支持'} {result.gpuMs !== null && result.gpuMs !== undefined ? 'ms' : ''}</p>
        <p>三角形 {result.triangles.toLocaleString()} · 绘制 {result.calls} 次 · 几何体 {result.geometries ?? '—'} · 纹理 {result.textures} 张</p>
      </div>}
    </section>
  </section>;
}

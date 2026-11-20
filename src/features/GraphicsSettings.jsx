import { translate } from '../i18n/index.js';
import { graphicsOptions, presetSettings, matchingPreset } from '../data/graphics.js';
export default function GraphicsSettings({ quality, onChange, test, result, onTest, onBack, error, live }) {
  const selectedPreset = matchingPreset(quality);
  return <section className="interaction-list shortcut-settings" id="room-interactions" aria-labelledby="graphics-title">
    <header><h2 id="graphics-title">{translate("i18n.graphicsAndPerformance")}</h2><button type="button" autoFocus onClick={onBack}>{translate("i18n.backToMenu")}</button></header>
    <div className="graphics-preset-row" role="group" aria-label={translate("i18n.graphicsPresets")}>{[['low', translate("i18n.low")], ['medium', translate("i18n.medium")], ['high', translate("i18n.high")], ['custom', translate("i18n.custom")]].map(([id, label]) => <button type="button" key={id} aria-pressed={selectedPreset === id} onClick={() => onChange(id === 'custom' ? { ...quality, mode: 'custom' } : presetSettings(id))}>{label}</button>)}</div>
    <p>{translate("i18n.current")}{' '}{translate({ low: "i18n.low", medium: "i18n.medium", high: "i18n.high", custom: "i18n.custom" }[selectedPreset])}</p>
    <section className="graphics-details" aria-label={translate("i18n.advancedSettings")}>
      {graphicsOptions.map(option => <div className="graphics-setting-row" key={option.key}>
        <label htmlFor={`graphics-${option.key}`} title={translate(option.help)}>{translate(option.label)}</label>
        <select id={`graphics-${option.key}`} value={String(quality[option.key])} onChange={event => {
          const value = option.choices.find(([v]) => String(v) === event.target.value)[0];
          onChange({ ...quality, mode: 'custom', [option.key]: value });
        }}>{option.choices.map(([value, label]) => <option key={String(value)} value={String(value)}>{translate(label)}</option>)}</select>
      </div>)}
    </section>
    {error && <p role="status">{translate(error)}</p>}
    <section className="interaction-group graphics-status"><h3>{translate("i18n.livePerformance")}</h3>
      <div className="graphics-metrics">
        <div><span>{translate("i18n.frameRate")}</span><strong>{!live ? translate("i18n.sampling") : live.hidden ? translate("i18n.pausedInBackground") : `${live.fps} FPS`}</strong></div>
        <div><span>{translate("i18n.frameTime")}</span><strong>{live && !live.hidden ? `${live.frameMs} ms` : '—'}</strong></div>
        <div><span>{translate("i18n.smoothness")}</span><strong>{!live || live.hidden ? '—' : live.fps >= 55 ? translate("i18n.smooth") : live.fps >= 30 ? translate("i18n.fair") : translate("i18n.low2")}</strong></div>
      </div>
      <button type="button" disabled={test} onClick={onTest}>{test ? translate("i18n.testing") : translate("i18n.runBenchmark")}</button>
      {test && <p role="status">{translate("i18n.keepThisWindowInTheForegroundFor")}</p>}
      {result && <div className="graphics-test-result" role="status">
        <p>{translate("i18n.benchmarkAverage", result.fps, result.p95, result.p99 ? ` · P99 ${result.p99} ms` : "")}</p>
        <p>{translate("i18n.benchmarkTiming", result.cpuFrameMs ?? "—", result.cpuRenderMs ?? "—", result.gpuMs == null ? translate("i18n.unsupported") : `${result.gpuMs} ms`)}</p>
        <p>{translate("i18n.benchmarkGeometry", result.triangles.toLocaleString(), result.calls, result.geometries ?? "—", result.textures)}</p>
      </div>}
    </section>
  </section>;
}

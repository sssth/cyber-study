export const graphicsPresets = {
  low: { label: '低画质 · 流畅', dpr: 1, shadowSize: 0, rain: 0.25, glows: false, detail: '标准分辨率 · 轻量贴图（场景支持时）· 关闭阴影和光晕' },
  medium: { label: '中画质 · 均衡', dpr: 1.5, shadowSize: 1024, rain: 0.6, glows: true, detail: '较清晰画面 · 均衡贴图（场景支持时）· 1024 阴影' },
  high: { label: '高画质 · 精细', dpr: 2, shadowSize: 2048, rain: 1, glows: true, detail: '高清画面 · 原尺寸贴图 · 最高 2048 阴影 · 完整雨滴' }
};

export const graphicsOptions = [
  { key: 'dpr', label: '渲染清晰度', help: '影响 GPU 像素负担和画面锐度；上限受屏幕像素比限制。', choices: [[1, '标准 · 1×'], [1.5, '清晰 · 1.5×'], [2, '精细 · 2×']] },
  { key: 'textures', label: '贴图资源精度', help: '影响表面细节与纹理内存。场景无对应资源时使用原资源；不减少模型面数。', choices: [['low', '轻量'], ['medium', '均衡'], ['high', '原尺寸']] },
  { key: 'shadowSize', label: '阴影精度', help: '影响阴影边缘和阴影纹理开销；不超过场景自身配置。', choices: [[0, '关闭'], [512, '低 · 512'], [1024, '中 · 1024'], [2048, '高 · 2048']] },
  { key: 'rain', label: '雨滴密度', help: '影响雨景动画计算与绘制。仅在窗外雨开启且主题支持时可见。', choices: [[0, '关闭'], [0.25, '稀疏 · 25%'], [0.6, '适量 · 60%'], [1, '完整 · 100%']] },
  { key: 'glows', label: '灯光光晕', help: '控制装饰光晕的透明叠加，不改变房间灯光开关。', choices: [[false, '关闭'], [true, '开启']] },
  { key: 'antialias', label: '边缘抗锯齿', help: '平滑物体边缘，会增加渲染缓冲开销。切换时短暂重建画面。', choices: [[false, '关闭'], [true, '开启']] }
];
export function presetSettings(id) {
  const preset = graphicsPresets[id] ?? graphicsPresets.medium;
  return { dpr: preset.dpr, textures: Object.hasOwn(graphicsPresets, id) ? id : 'medium', shadowSize: preset.shadowSize, rain: preset.rain, glows: preset.glows, antialias: true };
}
export function normalizeGraphics(value) {
  if (typeof value === 'string') return presetSettings(value);
  const defaults = presetSettings('medium');
  const settings = Object.fromEntries(graphicsOptions.map(({ key, choices }) => [key, choices.some(([v]) => v === value?.[key]) ? value[key] : defaults[key]]));
  if (value?.mode === 'custom') settings.mode = 'custom';
  return settings;
}
export function matchingPreset(value) {
  if (value.mode === 'custom') return 'custom';
  return Object.keys(graphicsPresets).find(id => graphicsOptions.every(({key}) => value[key] === presetSettings(id)[key])) ?? 'custom';
}
export function loadGraphics() {
  try {
    const saved = localStorage.getItem('study-graphics');
    if (!saved) return presetSettings('medium');
    if (Object.hasOwn(graphicsPresets, saved)) return presetSettings(saved);
    return normalizeGraphics(JSON.parse(saved));
  } catch { return presetSettings('medium'); }
}

export function needsGraphicsCalibration() {
  try {
    const saved = localStorage.getItem('study-graphics');
    if (!saved) return true;
    if (Object.hasOwn(graphicsPresets, saved)) return false;
    const value = JSON.parse(saved);
    return !value || !graphicsOptions.every(({key, choices}) => choices.some(([choice]) => choice === value[key]));
  } catch { return true; }
}

// Start at medium; only test high when medium sustains the 60 FPS target.
export function calibrationDecision(tier, result) {
  const comfortable = result.fps >= 55 && Number(result.p95) <= 25;
  if (tier === 'medium') return comfortable ? { next: 'high' } : { next: 'low' };
  return { selected: tier === 'high' && !comfortable ? 'medium' : tier };
}

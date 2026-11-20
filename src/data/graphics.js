export const graphicsPresets = {
  low: { label: "i18n.lowQualityFaster", dpr: 1, shadowSize: 0, rain: 0.25, glows: false, detail: "i18n.standardResolutionLightweightTexturesWhenAvailableShadows" },
  medium: { label: "i18n.mediumQualityBalanced", dpr: 1.5, shadowSize: 1024, rain: 0.6, glows: true, detail: "i18n.sharperRenderingBalancedTexturesWhenAvailable1024" },
  high: { label: "i18n.highQualityDetailed", dpr: 2, shadowSize: 2048, rain: 1, glows: true, detail: "i18n.hdRenderingFullSizeTexturesUpTo" }
};

export const graphicsOptions = [
  { key: 'dpr', label: "i18n.renderResolution", help: "i18n.affectsGpuWorkloadAndSharpnessLimitedBy", choices: [[1, "i18n.standard1"], [1.5, "i18n.sharp15"], [2, "i18n.fine2"]] },
  { key: 'textures', label: "i18n.textureQuality", help: "i18n.affectsSurfaceDetailAndTextureMemoryFalls", choices: [['low', "i18n.lightweight"], ['medium', "i18n.balanced"], ['high', "i18n.originalSize"]] },
  { key: 'shadowSize', label: "i18n.shadowQuality", help: "i18n.affectsShadowEdgesAndMemoryUseUp", choices: [[0, "i18n.off"], [512, "i18n.low512"], [1024, "i18n.medium1024"], [2048, "i18n.high2048"]] },
  { key: 'rain', label: "i18n.rainDensity", help: "i18n.affectsRainAnimationAndRenderingVisibleWhen", choices: [[0, "i18n.off"], [0.25, "i18n.light25"], [0.6, "i18n.moderate60"], [1, "i18n.full100"]] },
  { key: 'glows', label: "i18n.lightGlows", help: "i18n.controlsDecorativeGlowsIndependentlyOfTheRoom", choices: [[false, "i18n.off"], [true, "i18n.on"]] },
  { key: 'antialias', label: "i18n.antialiasing", help: "i18n.smoothsEdgesAndIncreasesBufferUsageChanging", choices: [[false, "i18n.off"], [true, "i18n.on"]] }
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
  return presetSettings('low');
}

export function needsGraphicsCalibration() {
  return false;
}

// Start at medium; only test high when medium sustains the 60 FPS target.
export function calibrationDecision(tier, result) {
  const comfortable = result.fps >= 55 && Number(result.p95) <= 25;
  if (tier === 'medium') return comfortable ? { next: 'high' } : { next: 'low' };
  return { selected: tier === 'high' && !comfortable ? 'medium' : tier };
}

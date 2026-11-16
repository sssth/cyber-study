// The base file is always the full-detail fallback for older packages and high quality.
export function modelsForQuality(scene, quality) {
  return scene.models.map(model => {
    const file = model.qualityFiles?.[quality];
    const selected = file && scene.assetUrl ? { ...model, modelUrl: scene.assetUrl(file) } : model;
    return model.lod && scene.assetUrl ? { ...selected, lodUrls: model.lod.levels.map(level => scene.assetUrl(level.file)), lodQuality: quality } : selected;
  });
}

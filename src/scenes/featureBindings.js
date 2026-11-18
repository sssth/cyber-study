// Stable application-owned IDs. Scene packages cannot define executable actions.
export const featureCatalog = [
  ['shelf', '书库', '打开书库'], ['desk', '书桌', '打开知识库与创作台'],
  ['window', '窗户', '开关窗外雨'], ['lamp', '灯', '切换灯光'],
  ['knowledge', '知识库', '打开知识库与创作台'], ['music', '唱片机', '打开音乐'],
  ['movie', '影碟机', '打开电影收藏'], ['diary', '日记', '打开日记'],
  ['memo', '便签', '打开便签与待办'], ['globe', '地球仪', '打开地点照片'],
  ['typewriter', '打字机', '打开抄写功能'], ['cat', '猫', '单击查看猫咪 · 双击抚摸'],
  ['crystal', '水晶对话', '打开 AI 对话'],
  ['plant', '植物', '单击查看植物 · 双击浇水']
].map(([id, label, description]) => ({ id, label, description }));
export const featureIds = [...featureCatalog.map(f => f.id), 'pet'];
export function resolveSceneFeature(model) {
  // Explicit null makes even a reserved ID decorative. Unknown IDs are inert.
  const id = model.feature === undefined ? model.id : model.feature;
  return featureIds.includes(id) ? id : null;
}
export function dispatchSceneFeature(id, handlers, model) {
  if (id === 'shelf') handlers.onOpenReader?.('library');
  else if (id === 'desk') handlers.onOpenFeature?.('knowledge');
  else if (id === 'window') handlers.onToggleRain?.();
  else if (id === 'lamp') handlers.onToggleLights?.();
  else if (id === 'cat' || id === 'pet') handlers.onOpenFeature?.('pet', model);
  else if (featureIds.includes(id)) handlers.onOpenFeature?.(id, model);
}

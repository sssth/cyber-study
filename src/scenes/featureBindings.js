import { features } from "../features/definitions.js";

// Stable application-owned IDs. Scene packages cannot define executable actions.
const roomActions = [
  ['desk', 'i18n.desk', 'i18n.openTheKnowledgeBaseAndWorkspace'],
  ['window', 'i18n.window', 'i18n.toggleOutdoorRain'], ['lamp', 'i18n.lamp', 'i18n.toggleLights'],
  ['knowledge', 'i18n.knowledgeBase', 'i18n.openTheKnowledgeBaseAndWorkspace'],
  ['cat', 'i18n.pet', 'i18n.clickToViewTheCatDoubleClick'],
  ['crystal', 'i18n.aiChat', 'i18n.openAiChat'],
  ['plant', 'i18n.plant', 'i18n.clickToViewThePlantDoubleClick']
].map(([id, label, description]) => ({ id, label, description }));
const [library, ...panels] = features;
export const featureCatalog = [library, ...roomActions.slice(0, 4), ...panels, ...roomActions.slice(4)];
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

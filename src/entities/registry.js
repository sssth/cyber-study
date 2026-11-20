import { features } from '../features/definitions.js';

export function registerEntities(featureDefinitions) {
  const types = Object.create(null);
  for (const feature of featureDefinitions) {
    for (const [type, definition] of Object.entries(feature.entities)) {
      if (Object.hasOwn(types, type)) throw Error(`Duplicate entity type: ${type}`);
      types[type] = {
        ...definition,
        target: { feature: feature.id, scope: feature.id, filter: 'id', ...definition.target }
      };
    }
  }
  return types;
}

export const entityTypes = registerEntities(features);
export const contentTypes = Object.fromEntries(Object.entries(entityTypes).map(([type, definition]) => [type, definition.label]));

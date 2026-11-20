import { features } from './definitions.js';

const views = Object.values(import.meta.glob('./*/view.jsx', { eager: true, import: 'default' }));
export const featureViews = Object.fromEntries(views.map(view => [view.id, view]));
export const persistentFeatureViews = features.flatMap(({ id }) => featureViews[id]?.persistent ? [featureViews[id]] : []);

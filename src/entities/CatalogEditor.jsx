import { featureViews } from '../features/views.js';
import { entityTypes } from './registry.js';

export default function CatalogEditor(props) {
  const feature = featureViews[entityTypes[props.item.type]?.target.feature];
  const Editor = feature?.editors?.[props.item.type] ?? feature?.edit;
  return Editor ? <Editor {...props} editItem={props.item} /> : null;
}

import definition from './definition.js';
import GlobePanel from './GlobePanel.jsx';
import GlobeEditor from './GlobeEditor.jsx';

function GlobeView({ navigation, onClose }) {
  return <GlobePanel navigationItem={navigation.item} onClose={onClose} />;
}

export default { id: definition.id, panel: GlobeView, edit: GlobeEditor };

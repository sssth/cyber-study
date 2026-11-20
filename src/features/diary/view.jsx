import definition from './definition.js';
import DiaryPanel from './DiaryPanel.jsx';

function DiaryView({ navigation, onClose }) {
  return <DiaryPanel navigationItem={navigation.item} onClose={onClose} />;
}

export default { id: definition.id, panel: DiaryView, edit: DiaryPanel };

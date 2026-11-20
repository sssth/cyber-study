import definition from './definition.js';
import MusicPlayer from './MusicPlayer.jsx';

function PersistentMusic({ active, catalogItem, onCatalogClose, navigation, shortcuts, shortcutsEnabled, onClose }) {
  return <MusicPlayer open={active} catalogItem={catalogItem} onCatalogClose={onCatalogClose}
    navigation={navigation} shortcuts={shortcuts} shortcutsEnabled={shortcutsEnabled} onClose={onClose} />;
}

export default { id: definition.id, persistent: PersistentMusic };

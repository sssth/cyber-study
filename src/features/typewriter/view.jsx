import definition from './definition.js';
import TypewriterPanel from './TypewriterPanel.jsx';

function TypewriterView({ importedBooks, copyRequest, closeCopy }) {
  return <TypewriterPanel importedBooks={importedBooks} initialSource={copyRequest} onClose={closeCopy} />;
}

function TypewriterEditor({ editItem, books, onClose }) {
  return <TypewriterPanel editItem={editItem} importedBooks={books} onClose={onClose} />;
}

export default { id: definition.id, panel: TypewriterView, edit: TypewriterEditor };

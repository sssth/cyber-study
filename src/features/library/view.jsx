import useActivityTime from '../../ui/useActivityTime.js';
import { translate } from '../../i18n/index.js';
import { removeExcerptAnnotation } from './knowledgeStore.js';
import { ActionWorkspace } from '../ui.jsx';
import definition from './definition.js';
import CatalogBookEditor from './CatalogBookEditor.jsx';
import KnowledgeWorkspace from './KnowledgeWorkspace.jsx';
import Annotation from './Annotation.jsx';
import ReaderOverlay from './ReaderOverlay.jsx';

function ExcerptEditor({ editItem, books, onBooksChanged, onStartCopy, onOpenNote, onClose }) {
  return <KnowledgeWorkspace editItem={editItem} importedBooks={books} onBooksChanged={onBooksChanged}
    onStartCopy={onStartCopy} onOpenNote={onOpenNote} onClose={onClose} />;
}

function AnnotationEditor({ item, onClose }) {
  useActivityTime('reading');
  return <ActionWorkspace command={false} showTrigger={false} kind="edit" title={translate('i18n.editAnnotation')}
    open onOpenChange={open => { if (!open) onClose(); }}>
    <Annotation editOnly note={{...item,annotation:item.annotation ?? item.text}} onSaved={onClose} onCancel={onClose}
      onDelete={() => { removeExcerptAnnotation(item); onClose(); }} />
  </ActionWorkspace>;
}

export default { id: definition.id, reader: ReaderOverlay, editors: { book: CatalogBookEditor, excerpt: ExcerptEditor, annotation: AnnotationEditor } };

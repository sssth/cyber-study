import { lazy, Suspense } from 'react';
import { translate } from '../../i18n/index.js';

const BookGroupPreview = lazy(() => import('./ShelfModel.jsx').then(module => ({ default: module.BookGroupPreview })));

export default function ShelfBookPreview({ books, orientation, onTurn, disabled = false }) {
  return (
    <div className="shelf-book-preview">
      <div className="shelf-workspace-preview">
        <Suspense fallback={null}>
          <BookGroupPreview books={books} orientation={orientation} />
        </Suspense>
      </div>
      <div className="shelf-orientation-controls">
        <button type="button" aria-label={translate("i18n.previousBookOrientation")} disabled={disabled} onClick={() => onTurn(-1)}>←</button>
        <button type="button" aria-label={translate("i18n.nextBookOrientation")} disabled={disabled} onClick={() => onTurn(1)}>→</button>
      </div>
    </div>
  );
}

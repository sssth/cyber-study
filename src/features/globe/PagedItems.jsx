import { useState } from 'react';
import { translate } from '../../i18n/index.js';

export default function PagedItems({items, children, size = 90}) {
  const [requested, setPage] = useState(0);
  const pages = Math.ceil(items.length / size);
  const page = Math.min(requested, Math.max(0, pages - 1));
  const start = page * size;
  const change = (event, next) => {
    const container = event.currentTarget.parentElement.parentElement;
    container.scrollTop = 0;
    setPage(next);
  };
  return <>{items.slice(start, start + size).map(children)}
    {pages > 1 && <div className="globe-page-controls">
      <button type="button" disabled={!page} onClick={e=>change(e,page-1)}>{translate('i18n.previousPage2')}</button>
      <span>{page+1} / {pages}</span>
      <button type="button" disabled={page+1===pages} onClick={e=>change(e,page+1)}>{translate('i18n.nextPage2')}</button>
    </div>}
  </>;
}

import { commands, invokeCommand } from '../ui/commands.js';
import { translate } from '../i18n/index.js';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { isCreating } from './ContentCommands.jsx';
import { commandTargetMode } from '../ui/commandTarget.js';

const buttons = [
  ['search', 'i18n.search'], ['create', 'i18n.new'], ['edit', 'i18n.edit'],
  ['snapshot', 'i18n.snapshot'], ['relate', 'i18n.link']
];
const tracked = 'dialog, [data-create-active], [data-edit-active], .unified-search, .feature-overlay';
const expandedKey = 'cyber-study.command-toolbar.expanded';

export default function CommandToolbar({ shortcuts }) {
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem(expandedKey) !== 'false'; }
    catch { return true; }
  });
  const [status, setStatus] = useState(null);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem(expandedKey, String(next)); }
    catch { /* The toolbar can still toggle when local storage is unavailable. */ }
  };

  useEffect(() => {
    const sync = () => {
      const modal = [...document.querySelectorAll('dialog:modal')].at(-1);
      const mode = commandTargetMode();
      const relate = modal?.matches('.content-relation-dialog') ?? false;
      const projection = modal?.matches('.map-projection') ?? false;
      setStatus({
        host: modal || document.fullscreenElement || document.body,
        available: !modal || relate || projection,
        loading: projection && !modal.querySelector('.feature-overlay'),
        relationDialog: relate,
        mode,
        search: Boolean(document.querySelector('.unified-search')),
        create: isCreating(),
        edit: mode === 'edit' || document.body.hasAttribute('data-item-editing') ||
          Boolean(document.querySelector('[data-edit-active]')),
        relate: mode === 'relate' || relate
      });
    };
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' ||
          [...record.addedNodes, ...record.removedNodes].some(node =>
            node instanceof Element && (node.matches(tracked) || node.querySelector(tracked))))) sync();
    });
    observer.observe(document.body, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['open', 'data-command-target', 'data-item-editing', 'data-create-active', 'data-edit-active', 'inert']
    });
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener('fullscreenchange', sync);
    };
  }, []);

  if (!status?.available) return null;

  return createPortal(
    <nav className="command-toolbar" aria-label={translate("i18n.pageActions")}>
      <button className="command-toolbar-toggle" type="button" aria-expanded={expanded}
        aria-controls="page-command-buttons" aria-label={expanded ? translate("i18n.collapseToolbar") : translate("i18n.expandToolbar")}
        title={expanded ? translate("i18n.collapseToolbar") : translate("i18n.expandToolbar")} onClick={toggleExpanded}>
        <span aria-hidden="true">{expanded ? '›' : '‹'}</span>
      </button>
      <div id="page-command-buttons" hidden={!expanded}>
        {buttons.map(([id, label]) => {
          const { shortcut } = commands[id];
          const hint = shortcut ? shortcuts[shortcut]?.join(' / ') :
            id === 'edit' ? translate("i18n.doubleClickAnItem") : translate("i18n.rightClickAnItem");
          const selecting = status.mode === id;
          return <button key={id} type="button"
            aria-pressed={id === 'snapshot' ? undefined : status[id]}
            disabled={id !== 'snapshot' && (status.loading || (id === 'edit' && status.relationDialog))}
            title={selecting ? translate("i18n.selectAnItem") : [translate(label), hint].filter(Boolean).join(' · ')}
            onClick={click => invokeCommand(id, click.currentTarget)}>
            {translate(label)}
          </button>;
        })}
      </div>
      {expanded && status.mode && <span className="command-target-hint" role="status">
        {status.mode === 'edit' ? translate("i18n.selectAnItemToEdit") : translate("i18n.selectAnItemToLink")}
      </span>}
    </nav>, status.host
  );
}

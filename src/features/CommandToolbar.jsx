import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { isCreating } from './ContentCommands.jsx';
import { commandTargetMode } from '../ui/commandTarget.js';

const buttons = [
  ['search', '检索', 'cyber-toggle-search', 'search'],
  ['create', '新建', 'cyber-toggle-create', 'createContent'],
  ['edit', '编辑', 'cyber-toggle-edit'],
  ['snapshot', '快照', 'cyber-save-snapshot', 'snapshot'],
  ['relate', '关联', 'cyber-toggle-relate']
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
    <nav className="command-toolbar" aria-label="页面操作">
      <button className="command-toolbar-toggle" type="button" aria-expanded={expanded}
        aria-controls="page-command-buttons" aria-label={expanded ? '收起操作栏' : '展开操作栏'}
        title={expanded ? '收起操作栏' : '展开操作栏'} onClick={toggleExpanded}>
        <span aria-hidden="true">{expanded ? '›' : '‹'}</span>
      </button>
      <div id="page-command-buttons" hidden={!expanded}>
        {buttons.map(([id, label, event, shortcut]) => {
          const hint = shortcut ? shortcuts[shortcut]?.join(' / ') :
            id === 'edit' ? '双击实体' : '右键点击实体';
          const selecting = status.mode === id;
          return <button key={id} type="button"
            aria-pressed={id === 'snapshot' ? undefined : status[id]}
            disabled={id !== 'snapshot' && (status.loading || (id === 'edit' && status.relationDialog))}
            title={selecting ? '请点击要操作的实体' : [label, hint].filter(Boolean).join(' · ')}
            onClick={click => click.currentTarget.dispatchEvent(new Event(event, { bubbles: true }))}>
            {label}
          </button>;
        })}
      </div>
      {expanded && status.mode && <span className="command-target-hint" role="status">
        {status.mode === 'edit' ? '点击要编辑的实体' : '点击要关联的实体'}
      </span>}
    </nav>, status.host
  );
}

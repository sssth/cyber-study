import { currentResultSource } from '../results/activeResults.js';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { commands, handleCommandKey } from '../ui/commands.js';
import { matchesShortcut, typingTarget } from '../data/shortcuts.js';
import { setCommandTargetMode } from '../ui/commandTarget.js';
import { clearSelection, getSelection, selectResults, subscribeSelection, validateSelection } from './entitySelection.js';
import { sharedFields } from './bulkFields.js';
import { writeSelection } from './bulkWrite.js';
import { translate, translateError } from '../i18n/index.js';
import { catalogHandlesPageBack, usePageBackMatcher } from '../ui/useEscapeBack.js';
import { ActionWorkspace, WorkspaceActions, WorkspaceFields } from '../features/ui.jsx';

function BulkEditor({ items, close, running, host, books, updateBooks, removeBook }) {
  const [remaining, setRemaining] = useState(items);
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fields = sharedFields(remaining);
  const patch = Object.fromEntries(Object.entries(values).map(([key, value]) =>
    [key, value.trim()]).filter(([, value]) => value));
  const count = remaining.length;
  const hasBooks = remaining.some(item => item.type === 'book');
  const protectedBook = remaining.some(item => item.type === 'book' && (!window.cyberStudy?.deleteBooks || !/^(file:|local:)/.test(item.id)));
  async function apply(remove) {
    if (running.current) return;
    const prompt = translate('i18n.bulkDeleteFirst', count) + (remaining.some(item => item.type === 'excerpt') ? '\n' + translate('i18n.bulkExcerptDelete') : '');
    if (remove && (!window.confirm(prompt) ||
      (!hasBooks && !window.confirm(translate('i18n.bulkDeleteFinal', count))))) return;
    running.current = true;
    setBusy(true);
    setError('');
    const done = new Set();
    try {
      const saved = await writeSelection(remaining, remove ? {} : patch, remove, { books, updateBooks, removeBook,
        completed: (type, id) => done.add(type + ':' + id) });
      if (saved) close();
    } catch (failure) {
      setRemaining(remaining.filter(item => !done.has(item.key)));
      setError([done.size && translate('i18n.bulkCompleted', done.size), translateError(failure.message)].filter(Boolean).join(' '));
    } finally {
      running.current = false;
      setBusy(false);
      window.dispatchEvent(new Event('cyber-content-changed'));
    }
  }
  return <ActionWorkspace kind="edit" bulk title="i18n.bulkEdit" open command={false} showTrigger={false}
    portalHost={host} onOpenChange={open => { if (!open && !running.current) close(); }}>
    <form className="stack-form" onSubmit={event => { event.preventDefault(); apply(false); }}>
      <WorkspaceFields><strong>{translate('i18n.selectedCount', count)}</strong>
        <ul className="bulk-entity-list">{remaining.map(item => <li key={item.key}>{item.title}</li>)}</ul>
        {!fields.length && <p>{translate('i18n.noSharedFields')}</p>}
        {fields.map(({ key, label, multiline }) => {
          const props = { value: values[key] ?? '', disabled: busy, onChange: event => setValues({ ...values, [key]: event.target.value }) };
          return <label key={key}>{translate(label)}{multiline ? <textarea {...props} rows={3}/> :
            <input {...props} maxLength={key === 'title' || key === 'author' ? 500 : undefined}/>}</label>;
        })}
        {protectedBook && <p>{translate('i18n.protectedBookSelection')}</p>}
        {error && <p role="alert">{error}</p>}
      </WorkspaceFields>
      <WorkspaceActions><button disabled={busy || !count || !Object.keys(patch).length}>{translate('i18n.save')}</button>
        <button type="button" disabled={busy || !count || protectedBook} onClick={() => apply(true)}>{translate('i18n.delete')}</button></WorkspaceActions>
    </form>
  </ActionWorkspace>;
}

export default function BulkEntityCommands({ shortcuts, disabled, projection, viewKey, ...storage }) {
  const selection = useSyncExternalStore(subscribeSelection, getSelection);
  const [editor, setEditor] = useState(null);
  const [message, setMessage] = useState('');
  const running = useRef(false);
  const back = usePageBackMatcher();
  const latest = useRef(null);
  latest.current = { shortcuts, disabled, projection, back, editor };
  const host = [...document.querySelectorAll('dialog:modal')].at(-1) || document.fullscreenElement || document.body;

  useLayoutEffect(() => {
    if (!selection) return;
    const selector = '[data-entity-key], [data-content-target]';
    const mark = node => node.toggleAttribute('data-bulk-selected',
      selection.keys.has(node.dataset.entityKey ?? node.dataset.contentTarget) && node.checkVisibility());
    function refresh(root) {
      if (root.matches(selector) || root.hasAttribute('data-bulk-selected')) mark(root);
      root.querySelectorAll(selector).forEach(mark);
    }
    refresh(document.body);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') refresh(record.target);
        else for (const node of record.addedNodes) if (node instanceof Element) refresh(node);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-entity-key', 'data-content-target', 'hidden'] });
    return () => {
      observer.disconnect();
      document.querySelectorAll('[data-bulk-selected]').forEach(node => node.removeAttribute('data-bulk-selected'));
    };
  }, [selection]);
  useEffect(() => { clearSelection(); setEditor(null); setMessage(''); }, [viewKey, disabled, projection]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 3200);
    return () => clearTimeout(timer);
  }, [message]);

  // Register before the single-item handlers and keep that order across editor toggles.
  useLayoutEffect(() => {
    const close = () => { if (!running.current) setEditor(null); };
    const unsubscribe = subscribeSelection(() => { if (!getSelection()) close(); });
    const select = () => {
      if (latest.current.disabled || running.current) return;
      setCommandTargetMode(null);
      const selectVisible = currentResultSource('selectAll')?.selectVisible;
      if (selectVisible) { selectVisible(); return; }
      validateSelection();
      setMessage(selectResults(latest.current.projection));
      if (getSelection()) window.dispatchEvent(new Event('cyber-exit-item-edit'));
    };
    const key = event => {
      if (latest.current.disabled) return;
      if (latest.current.editor && latest.current.back(event)) {
        if (!running.current && catalogHandlesPageBack()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }
      if (latest.current.editor && matchesShortcut(event, latest.current.shortcuts?.createContent)) {
        if (running.current) { event.preventDefault(); event.stopImmediatePropagation(); }
        else clearSelection();
        return;
      }
      if (typingTarget(event.target)) return;
      const modal = [...document.querySelectorAll('dialog:modal')].at(-1);
      if (modal && !modal.matches('.map-projection, .content-relation-dialog')) return;
      handleCommandKey(event, 'selectAll', latest.current.shortcuts, select);
    };
    function activate(event, kind) {
      if (latest.current.disabled) return;
      const editSelected = currentResultSource('selectAll')?.editSelected;
      if (kind === 'edit' && editSelected) {
        event.stopImmediatePropagation();
        editSelected();
        return;
      }
      validateSelection();
      const picked = getSelection();
      if (!picked) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (running.current) return;
      if (kind === 'edit') {
        setEditor(current => current ? null : picked.items);
      } else {
        if (!picked.canRelate) return;
        const source = { id: 'selection', key: 'selection', members: picked.items, title: translate('i18n.selectedCount', picked.items.length) };
        window.dispatchEvent(new CustomEvent('cyber-show-relations', { detail: { source, selection: picked } }));
      }
    }
    const edit = event => activate(event, 'edit');
    const relate = event => activate(event, 'relate');
    const gesture = event => {
      const picked = getSelection();
      if (!picked || event.target.closest?.('.edit-sidebar, .unified-search, .command-toolbar, [inert]')) return;
      if (typingTarget(event.target) && !event.target.readOnly) return;
      const node = event.target.closest?.('[data-entity-key], [data-content-target]');
      if (!node || !picked.keys.has(node.dataset.entityKey ?? node.dataset.contentTarget)) return;
      // Detail surfaces contain their own page navigation and player controls.
      if (node.matches('.reader-shell, .record-deck, .globe-photo-viewer, .typewriter-immersive') &&
          event.target.closest('button, a, input, select')) return;
      if (event.type === 'click' || event.type === 'dragstart') {
        // The clicks preceding a double-click must not open or change the item.
        if (event.type === 'click' && !event.detail) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      activate(event, event.type === 'contextmenu' ? 'relate' : 'edit');
    };
    const bindings = [[commands.selectAll.event, select], ['keydown', key], [commands.edit.event, edit],
      [commands.relate.event, relate], [commands.create.event, close], ['cyber-exit-item-edit', close],
      ['click', gesture], ['dblclick', gesture], ['contextmenu', gesture], ['dragstart', gesture]];
    for (const [type, fn] of bindings) window.addEventListener(type, fn, true);
    return () => {
      unsubscribe();
      for (const [type, fn] of bindings) window.removeEventListener(type, fn, true);
    };
  }, []);

  if (editor) return <BulkEditor items={editor} running={running} close={() => setEditor(null)} host={host} {...storage}/>;
  return message && createPortal(<div className="entity-selection-status" role="status">{translateError(message)}</div>, host);
}

import { editActivationEvent } from '../ui/editGesture.js';
import EditSurface from '../ui/EditSurface.jsx';
import { WorkspaceActions } from './ui.jsx';
import { setItemEditing } from '../data/contentOrder.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { contentAt } from '../data/contentRelations.js';
import { matchesShortcut } from '../data/shortcuts.js';
import { commandTargetMode, setCommandTargetMode } from '../ui/commandTarget.js';
import { currentScope } from '../search/searchStore.js';

const commands = new Map();
const itemSelector = '[data-edit-item], .reader-annotation-card, [data-content-target]';
export const itemClickDelay = 420;

export function ContentEditButton({ label, run, disabled, confirm }) {
  return <button type="button" disabled={disabled} onClick={() => {
    if (!confirm || window.confirm(`确认${label}？`)) run();
  }}>{label}</button>;
}

export function ContentCommand({ kind = 'edit', label, run, disabled = false, confirm = false, value, createActive = kind === 'cancel-create' }) {
  const marker = useRef(null);
  const latest = useRef(null);
  latest.current = { kind, label, run, disabled, confirm, value };
  useLayoutEffect(() => {
    const node = marker.current;
    commands.set(node, () => latest.current);
    return () => commands.delete(node);
  }, []);
  return <span ref={marker} hidden aria-hidden="true" data-create-active={createActive || undefined} />;
}

function available(kind, target) {
  const modal = (target instanceof Element && target.closest('dialog:modal')) ||
    [...document.querySelectorAll('dialog:modal')].at(-1);
  const panels = [...document.querySelectorAll('.feature-overlay, .reader-overlay, .knowledge-detail')];
  const panel = modal || panels.findLast(node => !node.closest('[inert]')) || document.querySelector('.app-shell') || document.body;
  const options = [...commands].filter(([node, read]) =>
    panel.contains(node) && (!node.closest('dialog') || node.closest('dialog').open) &&
    !node.closest('[inert]') && (kind === 'create' || node.parentElement?.checkVisibility()) && read().kind === kind
  );
  const item = editTarget(target);
  const local = item && options.filter(([node]) => item.contains(node));
  return local?.length ? local : options;
}

export function isCreating() {
  return Boolean(document.querySelector('dialog[data-create-workspace][open]') ||
    available('cancel-create').length ||
    available('create').some(([node]) => node.hasAttribute('data-create-active')));
}

function editTarget(target) {
  if (!(target instanceof Element) || target.closest('input, textarea, select, label, [contenteditable], [inert]')) return null;
  const item = target.closest(itemSelector);
  const dialog = target.closest('dialog');
  return item && (!dialog || dialog.open) && item.checkVisibility() ? item : null;
}

function relatedContent(item) {
  return item && !item.matches('.reader-shell') ? contentAt(item) : null;
}

function itemEntries(item) {
  return [...commands].filter(([node, read]) =>
    item.contains(node) && node.closest(itemSelector) === item &&
    read().kind === 'edit' && !read().disabled
  );

}

export default function ContentCommands({ shortcuts, disabled, viewKey, targetView = viewKey, pending, onPendingHandled }) {
  const dialog = useRef(null);
  const latest = useRef(null);
  const [selection, setSelection] = useState(null);
  const [textEdit, setTextEdit] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  latest.current = { shortcuts, disabled, viewKey, saving, selection };

  const close = () => {
    setItemEditing(false);
    dialog.current?.close();
    dialog.current?.removeAttribute('data-create-workspace');
    setSelection(null);
    setTextEdit(null);
    setQuery('');
    setError('');
  };

  const launch = (kind, entries) => {
    const enabled = entries.filter(([, read]) => !read().disabled);
    if (!enabled.length) return;
    const command = enabled.length === 1 && enabled[0][1]();
    if (kind === 'create' && command && !command.confirm) {
      command.run();
      return;
    }
    if (kind === 'edit') {
      const editable = enabled.filter(([, read]) => !/删除|移除|解除关联/.test(read().label));
      const primary = editable[0];
      if (primary) {
        const [node, read] = primary;
        if (typeof read().value === 'string') setTextEdit({ node, read, value: read().value });
        else { read().run(); return; }
      }
    }
    setSelection({ kind, entries: enabled });
    if (kind === 'create') dialog.current.setAttribute('data-create-workspace', '');
    else setItemEditing(true);
    dialog.current.show();
    requestAnimationFrame(() => {
      dialog.current?.querySelector('input[type="search"], .stack-form > button:not(:disabled)')?.focus();
    });
  };
  const open = useRef(launch);
  open.current = launch;

  useEffect(() => {
    let pendingClick;
    let replaying = false;
    const cancelClick = () => {
      clearTimeout(pendingClick?.timer);
      pendingClick = null;
    };
    const openEdit = item => {
      if (!item || latest.current.disabled || dialog.current?.open) return;
      open.current('edit', itemEntries(item));
    };
    const chooseTarget = event => {
      const mode = commandTargetMode();
      if (!mode || latest.current.disabled || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.altKey || event.shiftKey ||
          event.target.closest('.command-toolbar, .edit-sidebar, .unified-search, [inert]')) return false;
      const contextTarget = event.target.closest('[data-relation-gesture]');
      const localEditor = event.target.closest('[data-edit-gesture]');
      const item = editTarget(event.target);
      const entries = item ? itemEntries(item) : [];
      if (event.target.closest('input, textarea, select, [contenteditable]') &&
          !contextTarget?.matches('.diary-paper')) return false;
      if (mode === 'relate' ? !contextTarget && !contentAt(event.target) : !entries.length && !localEditor) return false;
      if (localEditor?.matches('.display-shelf-stage') && mode === 'edit' && event.target.closest('canvas')) return false;
      cancelClick();
      setCommandTargetMode(null);
      event.preventDefault();
      event.stopImmediatePropagation();
      if (mode === 'relate') {
        event.target.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true, button: 2, clientX: event.clientX, clientY: event.clientY
        }));
      } else if (entries.length) {
        openEdit(item);
      } else {
        event.target.dispatchEvent(new MouseEvent(editActivationEvent, { bubbles: true, cancelable: true, detail: 2 }));
      }
      return true;
    };
    const click = event => {
      if (chooseTarget(event)) return;
      if(event.target.closest('[data-instant-selection], .display-shelf-stage'))return;
      if (document.body.hasAttribute('data-item-editing') && !event.target.closest('dialog, .edit-sidebar')) {
        const item = editTarget(event.target);
        const control = event.target.closest('button,a[href]');
        if (item && ((control && (control === item || control.hasAttribute('data-item-open'))) || (!control && item.hasAttribute('data-edit-select')))) {
          event.preventDefault(); event.stopImmediatePropagation();
          cancelClick();
          if (event.detail < 2 && !latest.current.saving) pendingClick = { timer: setTimeout(() => {
            pendingClick = null;
            if (!item.isConnected) return;
            if (dialog.current?.open) close();
            open.current('edit', itemEntries(item));
          }, itemClickDelay) };
          return;
        }
      }
      if (replaying || event.button !== 0 || !event.detail || event.metaKey ||
          event.ctrlKey || event.altKey || event.shiftKey || latest.current.disabled || dialog.current?.open) return;
      const item = editTarget(event.target);
      if (!item || (!relatedContent(item) && !itemEntries(item).length)) return;
      const control = event.target.closest('button, a[href]');
      if (!control || (control !== item && !control.hasAttribute('data-item-open'))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.detail > 1) {
        cancelClick();
        return;
      }
      cancelClick();
      const clickedView = latest.current.viewKey;
      pendingClick = { timer: setTimeout(() => {
        pendingClick = null;
        if (clickedView !== latest.current.viewKey || !control.isConnected || control.disabled || control.closest('[inert]') || document.querySelector('dialog:modal') !== control.closest('dialog:modal')) return;
        replaying = true;
        try { control.click(); }
        finally { replaying = false; }
      }, itemClickDelay) };
    };
    const doubleClick = event => {
      // The shared globe stage owns its reversible edit toggle in every host.
      if(event.target.closest('[data-instant-selection], .display-shelf-stage, .atlas-stage'))return;
      if (document.body.hasAttribute('data-item-editing') && !event.target.closest('input,textarea,select,[contenteditable], .edit-sidebar, dialog')) {
        cancelClick(); event.preventDefault(); event.stopImmediatePropagation();
        window.dispatchEvent(new Event('cyber-exit-item-edit')); close(); return;
      }
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey ||
          latest.current.disabled || dialog.current?.open) return;
      const item = editTarget(event.target);
      const control = event.target.closest?.('button, a[href]');
      if (!item || (control && control !== item && !control.hasAttribute('data-item-open')) || (!relatedContent(item) && !itemEntries(item).length)) return;
      cancelClick();
      event.preventDefault();
      event.stopImmediatePropagation();
      openEdit(item);
    };
    const toggleEdit = () => {
      if (latest.current.disabled || latest.current.saving) return;
      cancelClick();
      const active = commandTargetMode() === 'edit';
      const editing = document.body.hasAttribute('data-item-editing') ||
        Boolean(document.querySelector('[data-edit-active]'));
      setCommandTargetMode(active || editing ? null : 'edit');
      if (editing) {
        window.dispatchEvent(new Event('cyber-exit-item-edit'));
        if (dialog.current?.open && latest.current.selection?.kind === 'edit') close();
      }
    };
    const create = event => {
      if (latest.current.disabled) return;
      setCommandTargetMode(null);
      if (dialog.current?.open && latest.current.selection?.kind === 'create') {
        if (!latest.current.saving) close();
        return;
      }
      if (latest.current.saving) return;
      const workspace = document.querySelector('dialog[data-create-workspace][open]');
      if (workspace) {
        workspace.dispatchEvent(new Event('cancel', { cancelable: true }));
        return;
      }
      cancelClick();
      const entries = available('create', event.target);
      if (document.body.hasAttribute('data-item-editing')) {
        window.dispatchEvent(new Event('cyber-exit-item-edit'));
        close();
        requestAnimationFrame(() => open.current('create', entries));
        return;
      }
      const cancellation = available('cancel-create', event.target).find(([, read]) => !read().disabled);
      if (cancellation) { cancellation[1]().run(); return; }
      open.current('create', entries);
    };
    const keys = event => {
      if (latest.current.disabled || event.isComposing) return;
      if (event.key === 'Escape' && !event.defaultPrevented && commandTargetMode()) {
        setCommandTargetMode(null);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!matchesShortcut(event, latest.current.shortcuts.createContent)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) create(event);
    };
    const editItem = event => {
      cancelClick();
      if (!latest.current.disabled && !dialog.current?.open) openEdit(editTarget(event.target));
    };
    const editPresented = event => openEdit(event.detail?.item);
    window.addEventListener('cyber-edit-presented-item', editPresented);
    window.addEventListener('cyber-toggle-create', create);
    window.addEventListener('cyber-toggle-edit', toggleEdit);
    window.addEventListener('keydown', keys, true);
    window.addEventListener('click', click, true);
    window.addEventListener(editActivationEvent, doubleClick, true);
    window.addEventListener('contextmenu', cancelClick, true);
    window.addEventListener('cyber-edit-item', editItem, true);
    return () => {
      cancelClick();
      window.removeEventListener('cyber-edit-presented-item', editPresented);
      window.removeEventListener('cyber-toggle-create', create);
      window.removeEventListener('cyber-toggle-edit', toggleEdit);
      window.removeEventListener('keydown', keys, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener(editActivationEvent, doubleClick, true);
      window.removeEventListener('contextmenu', cancelClick, true);
      window.removeEventListener('cyber-edit-item', editItem, true);
    };
  }, []);

  useEffect(() => { close(); }, [viewKey, disabled]);
  useEffect(() => {
    setCommandTargetMode(null);
    let scopeId = currentScope()?.id;
    const resetTarget = () => {
      const nextScopeId = currentScope()?.id;
      if (scopeId !== nextScopeId) setCommandTargetMode(null);
      scopeId = nextScopeId;
    };
    window.addEventListener('cyber-search-scope-changed', resetTarget);
    return () => window.removeEventListener('cyber-search-scope-changed', resetTarget);
  }, [targetView, disabled]);
  useEffect(() => {
    const failure = event => setError(event.detail);
    window.addEventListener('cyber-order-error', failure);
    return () => window.removeEventListener('cyber-order-error', failure);
  }, []);

  useEffect(() => {
    if (!pending || disabled) return;
    if (pending.destination !== viewKey) { onPendingHandled(); return; }
    let frame;
    const deadline = performance.now() + 5000;
    const waitForPanel = () => {
      const entries = available('create');
      if (!entries.some(([, read]) => !read().disabled) && performance.now() < deadline) {
        frame = requestAnimationFrame(waitForPanel);
        return;
      }
      onPendingHandled();
      if (entries.some(([, read]) => !read().disabled)) open.current('create', entries);
    };
    frame = requestAnimationFrame(waitForPanel);
    return () => cancelAnimationFrame(frame);
  }, [pending, viewKey, disabled, onPendingHandled]);

  const title = selection?.kind === 'create' ? '新建' : '编辑';
  return <EditSurface ref={dialog} data-content-command-dialog aria-labelledby="content-command-title"
    onCancel={event => { event.preventDefault(); if (!saving) close(); }}>
    <header><h2 id="content-command-title">{title}</h2><button type="button" disabled={saving} onClick={close}>取消</button></header>
    {textEdit ? <form className="stack-form" onSubmit={async event => {
      event.preventDefault();
      if (saving || !textEdit.value.trim()) return;
      if (!textEdit.node.isConnected || textEdit.read().disabled) return close();
      setSaving(true);
      setError('');
      try {
        if (await textEdit.read().run(textEdit.value.trim()) === false) throw new Error('保存失败，请重试。');
        close();
      } catch (failure) {
        setError(failure.message);
      } finally {
        setSaving(false);
      }
    }}>
      <label>名称<input aria-label={textEdit.read().label} autoFocus required value={textEdit.value}
        onChange={event => setTextEdit({ ...textEdit, value: event.target.value })} /></label>
      <WorkspaceActions><button disabled={saving || !textEdit.value.trim()}>保存</button>
      {selection?.entries.filter(([, read]) => /删除|移除|解除关联/.test(read().label)).map(([node, read], index) =>
        <button key={index} type="button" disabled={saving || read().disabled} onClick={async () => {
          if (!node.isConnected || read().disabled || !window.confirm(`确认${read().label}？`)) return;
          setSaving(true);
          try { if (await read().run() !== false) close(); }
          catch (failure) { setError(failure.message); }
          finally { setSaving(false); }
        }}>删除</button>)}</WorkspaceActions>
      {error && <p role="alert">{error}</p>}
    </form> : <div className="stack-form">
      {(selection?.entries.length ?? 0) > 12 && <input type="search" aria-label="筛选操作"
        value={query} onChange={event => setQuery(event.target.value)} />}
      {selection?.entries.map(([node, read], index) => {
        const command = read();
        if (!command.label.toLowerCase().includes(query.trim().toLowerCase())) return null;
        return <button type="button" key={index} disabled={command.disabled} onClick={() => {
          if (!node.isConnected || read().disabled) return close();
          if (typeof command.value === 'string') {
            setTextEdit({ node, read, value: command.value });
            return;
          }
          if (command.confirm && !window.confirm(`确认${command.label}？`)) return;
          close();
          read().run();
        }}>{command.label}</button>;
      })}
    </div>}
  </EditSurface>;
}

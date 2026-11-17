import { useEffect, useRef, useState } from 'react';

import { contentAt } from '../data/contentRelations.js';
import { matchesShortcut } from '../data/shortcuts.js';

const commands = new Map();
const itemSelector = '[data-edit-item], .reader-annotation-card, [data-content-target]';
export const itemClickDelay = 420;

export function ContentEditButton({ label, run, disabled, confirm }) {
  return <button type="button" disabled={disabled} onClick={() => {
    if (!confirm || window.confirm(`确认${label}？`)) run();
  }}>{label}</button>;
}

export function ContentCommand({ kind = 'edit', label, run, disabled = false, confirm = false, value }) {
  const marker = useRef(null);
  const latest = useRef(null);
  latest.current = { kind, label, run, disabled, confirm, value };
  useEffect(() => {
    const node = marker.current;
    commands.set(node, () => latest.current);
    return () => commands.delete(node);
  }, []);
  return <span ref={marker} hidden aria-hidden="true" />;
}

function available(kind, target) {
  const modal = (target instanceof Element && target.closest('dialog[open]')) ||
    [...document.querySelectorAll('dialog[open]')].at(-1);
  const panels = [...document.querySelectorAll('.feature-overlay, .reader-overlay, .knowledge-detail')];
  const panel = modal || panels.findLast(node => !node.closest('[inert]')) || document.querySelector('.app-shell') || document.body;
  const options = [...commands].filter(([node, read]) =>
    panel.contains(node) && (!node.closest('dialog') || node.closest('dialog').open) &&
    !node.closest('[inert]') && node.parentElement?.checkVisibility() && read().kind === kind
  );
  const item = editTarget(target);
  const local = item && options.filter(([node]) => item.contains(node));
  return local?.length ? local : options;
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
    read().kind === 'edit' && !read().disabled && node.parentElement?.checkVisibility()
  );

}

export default function ContentCommands({ shortcuts, disabled, viewKey, pending, onPendingHandled }) {
  const dialog = useRef(null);
  const latest = useRef(null);
  const [selection, setSelection] = useState(null);
  const [textEdit, setTextEdit] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  latest.current = { shortcuts, disabled, viewKey, saving, selection };

  const close = () => {
    dialog.current?.close();
    setSelection(null);
    setTextEdit(null);
    setQuery('');
    setError('');
  };

  const launch = (kind, entries) => {
    const enabled = entries.filter(([, read]) => !read().disabled);
    if (!enabled.length) return;
    window.dispatchEvent(new Event('cyber-close-search'));
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
    dialog.current.showModal();
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
    const click = event => {
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
    const openItem = item => {
      const source = relatedContent(item);
      if (source) window.dispatchEvent(new CustomEvent('cyber-show-relations', {
        detail: { source, item, canEdit: itemEntries(item).length > 0 }
      }));
      else openEdit(item);
    };
    const doubleClick = event => {
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
    const keys = event => {
      if (latest.current.disabled || event.isComposing || !matchesShortcut(event, latest.current.shortcuts.createContent)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (dialog.current?.open) {
        if (latest.current.selection?.kind === 'create' && !latest.current.saving) close();
        return;
      }
      const workspace = document.querySelector('dialog[data-create-workspace][open]');
      if (workspace) {
        workspace.dispatchEvent(new Event('cancel', { cancelable: true }));
        return;
      }
      cancelClick();
      const cancellation = available('cancel-create', event.target).find(([, read]) => !read().disabled);
      if (cancellation) { cancellation[1]().run(); return; }
      open.current('create', available('create', event.target));
    };
    const editItem = event => {
      cancelClick();
      if (!latest.current.disabled && !dialog.current?.open) openEdit(editTarget(event.target));
    };
    const editPresented = event => openEdit(event.detail?.item);
    window.addEventListener('cyber-edit-presented-item', editPresented);
    window.addEventListener('keydown', keys, true);
    window.addEventListener('click', click, true);
    window.addEventListener('dblclick', doubleClick, true);
    window.addEventListener('contextmenu', cancelClick, true);
    window.addEventListener('cyber-edit-item', editItem, true);
    return () => {
      cancelClick();
      window.removeEventListener('cyber-edit-presented-item', editPresented);
      window.removeEventListener('keydown', keys, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('dblclick', doubleClick, true);
      window.removeEventListener('contextmenu', cancelClick, true);
      window.removeEventListener('cyber-edit-item', editItem, true);
    };
  }, []);

  useEffect(() => { close(); }, [viewKey, disabled]);

  useEffect(() => {
    if (!pending || pending.from === viewKey || disabled) return;
    let frame;
    const deadline = performance.now() + 5000;
    const waitForPanel = () => {
      const panel = document.querySelector('.feature-overlay, .reader-overlay, .knowledge-detail');
      if ((!panel || panel.closest('[inert]')) && performance.now() < deadline) {
        frame = requestAnimationFrame(waitForPanel);
        return;
      }
      onPendingHandled();
      open.current('create', available('create'));
    };
    frame = requestAnimationFrame(waitForPanel);
    return () => cancelAnimationFrame(frame);
  }, [pending, viewKey, disabled, onPendingHandled]);

  const title = selection?.kind === 'create' ? '新建' : '编辑';
  return <dialog ref={dialog} data-content-command-dialog className="action-workspace" aria-labelledby="content-command-title"
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
      <label>{textEdit.read().label}<input autoFocus required value={textEdit.value}
        onChange={event => setTextEdit({ ...textEdit, value: event.target.value })} /></label>
      <button disabled={saving || !textEdit.value.trim()}>保存修改</button>
      {selection?.entries.filter(([, read]) => /删除|移除|解除关联/.test(read().label)).map(([node, read], index) =>
        <button key={index} type="button" disabled={saving || read().disabled} onClick={async () => {
          if (!node.isConnected || read().disabled || !window.confirm(`确认${read().label}？`)) return;
          setSaving(true);
          try { if (await read().run() !== false) close(); }
          catch (failure) { setError(failure.message); }
          finally { setSaving(false); }
        }}>{read().label}</button>)}
      {error && <p role="alert">{error}</p>}
    </form> : <div className="stack-form">
      {(selection?.entries.length ?? 0) > 12 && <input type="search" aria-label="筛选操作" placeholder="按内容名称筛选"
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
  </dialog>;
}

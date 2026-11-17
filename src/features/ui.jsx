import { ContentCommand } from './ContentCommands.jsx';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export function FeaturePanel({ title, onClose, children, wide = false }) {
  const panel = useRef(null);
  useEffect(() => {
    const back = event => {
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented ||
          panel.current?.closest('[inert]') || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', back);
    return () => window.removeEventListener('keydown', back);
  }, [onClose]);
  return (
    <section ref={panel} className={`feature-overlay ${wide ? 'feature-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="feature-shell">
        <header className="feature-header">
          <div>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose}>返回书房</button>
        </header>
        <div className="feature-body">{children}</div>
      </div>
    </section>
  );
}

export function EmptyState({ children }) {
  return <p className="empty-state">{children}</p>;
}

// Shared secondary workspace: the collection remains the default surface.
export function ActionWorkspace({ label = '新建', title = label, children, open: controlled, onOpenChange, command = true, onCreate, showTrigger = true, disabled = false }) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlled ?? localOpen;
  const dialog = useRef(null);
  const trigger = useRef(null);
  const change = value => { setLocalOpen(value); onOpenChange?.(value); };
  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
    if (!open && dialog.current.open) dialog.current.close();
  }, [open]);
  return <>{command
    ? <ContentCommand kind="create" label={label} disabled={disabled} run={() => { onCreate?.(); change(true); }} />
    : showTrigger && <div className="secondary-action"><button ref={trigger} type="button" onClick={() => change(true)}>{label}</button></div>}
    {createPortal(<dialog ref={dialog} data-create-workspace={command ? true : undefined} className="action-workspace" aria-label={title}
      onCancel={event => { event.preventDefault(); change(false); }}
      onClose={() => { if (!dialog.current?.open) { change(false); trigger.current?.focus(); } }}>
      <header><h2>{title}</h2><button type="button" onClick={() => change(false)}>返回内容</button></header>
      {children}
    </dialog>, document.body)}</>;
}

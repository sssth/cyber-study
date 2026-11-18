import EditSurface from '../ui/EditSurface.jsx';
import { useNavigationState, useNavigationScroll } from '../ui/useNavigationState.js';
import useEditSession from '../ui/useEditSession.js';
import useEscapeBack, { blocksPageBack } from '../ui/useEscapeBack.js';
import { DisplayMenuToggle, DisplayCloseButton } from '../ui/DisplayControls.jsx';
import useDismissDisplayMenu from '../ui/useDismissDisplayMenu.js';
import { ContentCommand } from './ContentCommands.jsx';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export function FeaturePanel({ title, onClose, onBack = onClose, children, wide = false, hasMenu = false }) {
  const panel = useRef(null);
  const [menuOpen, setMenuOpen] = useNavigationState(title,'menuOpen',false);
  useNavigationScroll(`${title}.scroll`, panel, '.feature-body,.knowledge-results,.memo-board');
  useDismissDisplayMenu(menuOpen, setMenuOpen, panel);
  useEscapeBack(() => { onBack(); }, {
    blocked: event => panel.current?.closest('[inert]') || blocksPageBack(event)
  });
  return (
    <section ref={panel} data-menu-open={menuOpen} className={`feature-overlay ${wide ? 'feature-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="feature-shell">
        {hasMenu && <DisplayMenuToggle open={menuOpen} onToggle={() => setMenuOpen(value => !value)} />}
        <DisplayCloseButton onClose={onClose} />
        <div className="feature-body">{children}</div>
      </div>
    </section>
  );
}

export function EmptyState({ children }) {
  return <p className="empty-state">{children}</p>;
}

// Shared secondary workspace: the collection remains the default surface.
export function ActionWorkspace({ label = '新建', title = label, children, open: controlled, onOpenChange, command = true, onCreate, showTrigger = true, disabled = false, portalHost }) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlled ?? localOpen;
  const editing = /编辑|修改/.test(title);
  const dialog = useRef(null);
  const trigger = useRef(null);
  const change = value => { setLocalOpen(value); onOpenChange?.(value); };
  useLayoutEffect(() => {
    if (open && !dialog.current.open) { dialog.current.show(); }
    if (!open && dialog.current.open) dialog.current.close();
  }, [open, editing]);
  useEditSession(open, () => change(false), { editing });
  return <>{command
    ? <ContentCommand kind="create" label={label} disabled={disabled} run={() => { onCreate?.(); change(true); }} />
    : showTrigger && <div className="secondary-action"><button ref={trigger} type="button" onClick={() => change(true)}>{label}</button></div>}
    {createPortal(<EditSurface ref={dialog} data-create-workspace={command && !editing ? true : undefined} aria-label={title}
      onCancel={event => { event.preventDefault(); change(false); }}
      onClose={() => { if (!dialog.current?.open) { change(false); trigger.current?.focus(); } }}>
      <header><h2>{title}</h2><button type="button" onClick={() => change(false)}>返回内容</button></header>
      <WorkspaceFields>{children}</WorkspaceFields>
    </EditSurface>, portalHost || document.body)}</>;
}

// Shared action row for every create/edit form. Keep it inside the owning form
// so native submit behaviour and validation work without cloned buttons.
export function WorkspaceActions({ children }) {
  return <footer className="edit-actions">{children}</footer>;
}

export function WorkspaceFields({ children }) {
  return <div className="workspace-fields">{children}</div>;
}

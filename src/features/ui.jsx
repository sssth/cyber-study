import { rememberFocus, restoreFocus } from '../ui/focusReturn.js';
import { translate } from '../i18n/index.js';
import EditSurface from '../ui/EditSurface.jsx';
import { useNavigationState, useNavigationScroll } from '../ui/useNavigationState.js';
import useEditSession from '../ui/useEditSession.js';
import useEscapeBack, { blocksPageBack } from '../ui/useEscapeBack.js';
import { DisplayMenuToggle, DisplayCloseButton } from '../ui/DisplayControls.jsx';
import useDismissDisplayMenu from '../ui/useDismissDisplayMenu.js';
import { ContentCommand } from './ContentCommands.jsx';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export function FeaturePanel({ title, scopeId = title, onClose, onBack = onClose, children, wide = false, hasMenu = false, scrollContext }) {
  const panel = useRef(null);
  const [menuOpen, setMenuOpen] = useNavigationState(scopeId,'menuOpen',false,{ remember:false });
  useNavigationScroll(`${scopeId}.scroll`, panel, '.feature-body,.knowledge-results,.memo-board,[data-scroll-memory]');
  useDismissDisplayMenu(menuOpen, setMenuOpen, panel);
  useEscapeBack(() => { onBack(); }, {
    blocked: event => panel.current?.closest('[inert]') || blocksPageBack(event)
  });
  return (
    <section ref={panel} data-command-scope={scopeId} data-menu-open={menuOpen} className={`feature-overlay ${wide ? 'feature-wide' : ''}`} role="dialog" aria-modal="true" aria-label={translate(title)}>
      <div className="feature-shell">
        {hasMenu && <DisplayMenuToggle open={menuOpen} onToggle={() => setMenuOpen(value => !value)} />}
        <DisplayCloseButton onClose={onClose} />
        <div className="feature-body" data-scroll-memory={scrollContext}>{children}</div>
      </div>
    </section>
  );
}

export function EmptyState({ children }) {
  return <p className="empty-state">{children}</p>;
}

// Shared secondary workspace: the collection remains the default surface.
export function ActionWorkspace({ kind = 'create', label = "i18n.new", title = label, children, open: controlled, onOpenChange, command = true, onCreate, showTrigger = true, disabled = false, portalHost, scrollMemoryKey }) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlled ?? localOpen;
  const editing = kind === 'edit';
  const dialog = useRef(null);
  const trigger = useRef(null);
  const previousFocus = useRef(null);
  useNavigationScroll(scrollMemoryKey, dialog, '[data-scroll-memory]');
  const change = value => { setLocalOpen(value); onOpenChange?.(value); };
  useLayoutEffect(() => {
    if (open && !dialog.current.open) {
      previousFocus.current = rememberFocus(trigger.current ?? document.activeElement);
      dialog.current.show();
    }
    if (!open && dialog.current.open) dialog.current.close();
  }, [open, editing]);
  useEditSession(open, () => change(false), { editing });
  return <>{command
    ? <ContentCommand kind="create" label={label} disabled={disabled} run={() => { onCreate?.(); change(true); }} />
    : showTrigger && <div className="secondary-action"><button ref={trigger} type="button" onClick={() => change(true)}>{translate(label)}</button></div>}
    {createPortal(<EditSurface ref={dialog} data-create-workspace={command && !editing ? true : undefined} aria-label={translate(title)}
      onCancel={event => { event.preventDefault(); change(false); }}
      onClose={() => { if (!dialog.current?.open) { change(false); restoreFocus(previousFocus.current); } }}>
      <header><h2>{translate(title)}</h2><button type="button" onClick={() => change(false)}>{translate("i18n.backToContent")}</button></header>
      <div className="workspace-content">{children}</div>
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

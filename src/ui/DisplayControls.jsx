import { translate } from '../i18n/index.js';
// Shared chrome; callers own navigation and save guards.
export function DisplayMenuToggle({ open, onToggle, label = translate("i18n.openPanelMenu") }) {
  return <button className="display-menu-toggle" aria-label={label} aria-expanded={open} onClick={onToggle}>☰</button>;
}
export function DisplayCloseButton({ onClose, disabled = false, label = translate("i18n.returnToStudy2") }) {
  return <button className="display-close" aria-label={label} disabled={disabled} onClick={onClose}>×</button>;
}

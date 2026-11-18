// Shared chrome; callers own navigation and save guards.
export function DisplayMenuToggle({ open, onToggle, label = '展开功能菜单' }) {
  return <button className="display-menu-toggle" aria-label={label} aria-expanded={open} onClick={onToggle}>☰</button>;
}
export function DisplayCloseButton({ onClose, disabled = false, label = '返回书房' }) {
  return <button className="display-close" aria-label={label} disabled={disabled} onClick={onClose}>×</button>;
}

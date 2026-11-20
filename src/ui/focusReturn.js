export function rememberFocus(element = document.activeElement) {
  const key = element?.closest?.('[data-content-target]')?.dataset.contentTarget;
  return { element, key };
}

export function restoreFocus(bookmark) {
  if (!bookmark) return;
  const canFocus = node => node?.isConnected && !node.closest?.('[inert]') && node.checkVisibility?.();
  if (canFocus(bookmark.element)) {
    bookmark.element.focus({ preventScroll: true });
    return;
  }
  if (!bookmark.key) return;
  const candidates = document.querySelectorAll('[data-content-target]');
  const owner = [...candidates].reverse().find(node => node.dataset.contentTarget === bookmark.key && canFocus(node));
  const control = owner?.matches('button, a[href], [tabindex]') ? owner : owner?.querySelector('button, a[href], [tabindex]');
  control?.focus({ preventScroll: true });
}

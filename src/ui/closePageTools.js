// Close search first so it remembers the draft under the departing page's scope.
export function closePageTools() {
  window.dispatchEvent(new Event('cyber-close-search'));
  window.dispatchEvent(new Event('cyber-exit-item-edit'));
}

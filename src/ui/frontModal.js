// With multiple native modals, the browser hit-tests only the front dialog
// and its backdrop. DOM order can differ from the order of showModal() calls.
export function frontModal() {
  const dialogs = document.querySelectorAll('dialog:modal');
  if (dialogs.length < 2) return dialogs[0] ?? null;
  return document.elementFromPoint(0, 0)?.closest('dialog:modal')
    ?? document.activeElement?.closest('dialog:modal');
}

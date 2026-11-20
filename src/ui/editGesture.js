export const itemClickDelay = 420;

// A local surface may keep its own selection policy while sharing edit toggling.
export function toggleEditor(setOpen, event, ignoreWithin) {
  if (ignoreWithin && event?.target.closest(ignoreWithin)) return;
  setOpen(open => !open);
}

// Use the same activation event for registered items and local editing surfaces.
export const editActivationEvent = 'dblclick';
export function editActivationProps(edit) {
  return { onDoubleClick: edit, 'data-edit-gesture': '' };
}

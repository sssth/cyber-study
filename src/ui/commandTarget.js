export function commandTargetMode() {
  return document.body.getAttribute('data-command-target');
}

export function setCommandTargetMode(mode) {
  if (mode) document.body.setAttribute('data-command-target', mode);
  else document.body.removeAttribute('data-command-target');
}

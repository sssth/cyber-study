// Let the mounted globe consume its local history before external navigation.
export function requestGlobeBack() {
  return !window.dispatchEvent(new Event('cyber-globe-back', {cancelable:true}));
}

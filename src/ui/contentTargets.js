// DOM metadata identifies the exact content under the mouse, including nested annotations.
export const contentElements=new WeakMap();
export function contentAt(target){const element=target?.closest?.('[data-content-target]');return element?.isConnected?contentElements.get(element):null;}

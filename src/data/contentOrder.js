const storageKey = 'cyber-study-content-order-v1';
export function moveBefore(order, source, target) {
  if (source === target || !order.includes(source) || !order.includes(target)) return order;
  const next = order.filter(id => id !== source);
  next.splice(next.indexOf(target), 0, source);
  return next;
}
export function loadOrder(type) {
  try { return JSON.parse(localStorage.getItem(storageKey) || '{}')[type] || []; }
  catch { return []; }
}
export function saveOrder(type, order) {
  const data = JSON.parse(localStorage.getItem(storageKey) || '{}');
  localStorage.setItem(storageKey, JSON.stringify({ ...data, [type]: order }));
  window.dispatchEvent(new Event('cyber-order-changed'));
}
export function setItemEditing(active) {
  document.body.toggleAttribute('data-item-editing', active);
  window.dispatchEvent(new Event('cyber-edit-mode-changed'));
}

// A slot keeps its creation time and immutable key, including when occupied by another item.
function creationSlot(type, item) {
  const time = Date.parse(item.createdAt || item.importedAt || (type === 'diary' ? item.date : ''));
  return [Number.isFinite(time) ? time : 0, type + ':' + item.id];
}

function compareSlots(a, b) {
  return b[0] - a[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
}

export function readOrderState() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {}; }
  catch { return {}; }
}

function typeSlots(type, state) {
  const slots = new Map();
  // Older versions saved a list of keys. Keep their explicit precedence.
  const legacy = Array.isArray(state[type]) ? state[type] : [];
  for (const [index, key] of legacy.entries()) {
    slots.set(key, [Number.MAX_SAFE_INTEGER - index, key]);
  }
  for (const [key, slot] of Object.entries(state.slots?.[type] || {})) slots.set(key, slot);
  return slots;
}

export function orderType(items, type, state) {
  const slots = typeSlots(type, state);
  return items.map(item => ({item, slot: slots.get(type + ':' + item.id) || creationSlot(type, item)}))
    .sort((a,b) => compareSlots(a.slot,b.slot)).map(entry => entry.item);
}

export function orderCatalog(items, state) {
  const chronological = items.map(item => ({item, slot:creationSlot(item.type, item)}))
    .sort((a,b) => compareSlots(a.slot,b.slot)).map(entry => entry.item);
  const groups = new Map();
  for (const item of chronological) {
    if (!groups.has(item.type)) groups.set(item.type, []);
    groups.get(item.type).push(item);
  }
  const queues = new Map([...groups].map(([type,group]) => [type,orderType(group,type,state).values()]));
  return chronological.map(item => queues.get(item.type).next().value);
}

export function reorderVisible(state, type, items, source, target) {
  const slots = typeSlots(type,state);
  const visible = orderType(items,type,state);
  const keys = visible.map(item => type + ':' + item.id);
  const moved = moveBefore(keys,source,target);
  const positions = {...state.slots?.[type]};
  visible.forEach((item,index) => {
    if (keys[index] !== moved[index]) positions[moved[index]] = slots.get(keys[index]) || creationSlot(type,item);
  });
  return {...state, slots:{...state.slots,[type]:positions}};
}

export function saveVisibleOrder(type, items, source, target) {
  const state = reorderVisible(readOrderState(), type, items, source, target);
  localStorage.setItem(storageKey, JSON.stringify(state));
  window.dispatchEvent(new Event('cyber-order-changed'));
}

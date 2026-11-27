import { useRef } from 'react';
import CheckboxPicker from './CheckboxPicker.jsx';
import { toggleMatchingIds } from '../entities/entitySelection.js';
import { moveBefore } from '../data/contentOrder.js';

export default function OrderedMemberPicker({ legend, candidates, selectedIds, updateIds, optionLabel,
  memberTitle, memberDetail, confirmRemoval, sortable = true, disabled = false }) {
  const dragged = useRef(null);
  return <>
    <CheckboxPicker className="music-create-song-picker memory-journey-picker" onSelectVisible={() => {
      if (!disabled) updateIds(ids => toggleMatchingIds(ids, candidates.map(item => item.id)));
    }}>
      <legend>{legend}</legend>
      <div className="music-create-song-options">{candidates.map(item => <label key={item.id}>
        <input type="checkbox" disabled={disabled} checked={selectedIds.includes(item.id)} onChange={event => {
          const checked = event.target.checked;
          updateIds(ids => checked ? [...new Set([...ids, item.id])] : ids.filter(id => id !== item.id));
        }} />
        <span>{optionLabel(item)}</span>
      </label>)}</div>
    </CheckboxPicker>
    <ul className="memory-journey-stops">{selectedIds.map(id => <li key={id} draggable={sortable && !disabled}
      onDragStart={event => { dragged.current = id; event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; }}
      onDragEnd={() => { dragged.current = null; }}
      onDragOver={event => { if (!disabled && dragged.current && dragged.current !== id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
      onDrop={event => {
        event.preventDefault();
        const source = dragged.current;
        if (!disabled && source) updateIds(ids => moveBefore(ids, source, id));
        dragged.current = null;
      }}>
      <button type="button" disabled={disabled} onDoubleClick={event => {
        event.stopPropagation();
        if (window.confirm(confirmRemoval)) updateIds(ids => ids.filter(value => value !== id));
      }}><span className="journey-stop-title">{memberTitle(id)}</span>{memberDetail && <span className="journey-stop-place">{memberDetail(id)}</span>}</button>
    </li>)}</ul>
  </>;
}

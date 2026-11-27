import { useRef } from 'react';
import useResultSource from '../results/useResultSource.js';

// Register the whole filtered collection, including rows on other pages.
export default function CheckboxPicker({onSelectVisible, preferred = false, children, ...props}) {
  const field = useRef(null);
  useResultSource({
    onlyFor: 'selectAll', checkboxPicker: true,
    get priority() {
      if (field.current?.contains(document.activeElement)) return 3002;
      return preferred ? 3001 : 3000;
    },
    get enabled() {
      const node = field.current;
      if (!node?.checkVisibility() || node.closest('[inert]')) return false;
      const modal = [...document.querySelectorAll('dialog:modal')].at(-1);
      return !modal || modal.contains(node);
    },
    selectVisible: onSelectVisible
  });
  return <fieldset ref={field} {...props}>{children}</fieldset>;
}

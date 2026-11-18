import { useEffect } from 'react';

// Menu sections live along the edge; search and edit dialogs may be portalled.
const menuSections = '.display-menu-toggle, .reader-topbar, .shelf-view-bar, .arrangement-toolbar, .arrangement-layers, .knowledge-filters, .atlas-breadcrumbs, .atlas-controls, .globe-mode-switch, .atlas-sidebar';

export default function useDismissDisplayMenu(open, setOpen, surface) {
  useEffect(() => {
    if (!open) return;
    const dismiss = event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.unified-search, dialog[open]')) return;
      const section = target.closest(menuSections);
      if (section && surface.current?.contains(section)) return;
      setOpen(false);
    };
    // Capture also catches clicks on canvases whose controls stop propagation.
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [open, setOpen, surface]);
}

import { translate, useLanguage } from '../i18n/index.js';
const manualShortcutLabel = keys => keys[0]?.replace(/^((?:[^+]+\+)*)Cmd\+/, 'Command+$1').replace(/\+(?=.)/g, ' ');

export default function ManualOperations({ shortcuts }) {
  const english = useLanguage() === 'en';
  const space = english ? ' ' : '';
  return <>
    <section>
      <h3>{translate("i18n.basicControls")}</h3>
      <ul>
        <li><strong>{translate("i18n.switchPanels")}</strong></li>
        <li><strong>{translate("i18n.returnToStudy")}</strong></li>
        <li><strong><kbd>Esc</kbd>{' '}{translate("i18n.goBack")}</strong></li>
      </ul>
    </section>
    <section>
      <h3><kbd>{manualShortcutLabel(shortcuts.search) ?? translate("i18n.unassigned")}</kbd>{' '}{translate("i18n.searchAndFilterItems")}</h3>
      <ul>
        <li>{translate("i18n.onAnyPage")}{space}{manualShortcutLabel(shortcuts.search)
          ? <>{translate("i18n.press")}{' '}<kbd>{manualShortcutLabel(shortcuts.search)}</kbd>{' '}{translate("i18n.toToggleTheSearchBar")}</>
          : translate("i18n.assignAKeyInKeyboardShortcutsTo")}</li>
        <li>{translate("i18n.typeInTheSearchBarOrClick")}</li>
        <li>{translate("i18n.filtersApplyImmediatelyAndShowMatchingItems")}</li>
      </ul>
    </section>
    <section>
      <h3><kbd>{manualShortcutLabel(shortcuts.createContent) ?? translate("i18n.unassigned")}</kbd>{' '}{translate("i18n.createAnItem")}</h3>
      <ul>
        <li>{translate("i18n.inAFeaturePanel")}{space}{manualShortcutLabel(shortcuts.createContent)
          ? <>{translate("i18n.press")}{' '}<kbd>{manualShortcutLabel(shortcuts.createContent)}</kbd>{' '}{translate("i18n.toAddAnItem")}</>
          : translate("i18n.assignAKeyInKeyboardShortcutsThen")}</li>
      </ul>
    </section>
    <section>
      <h3><span className="manual-mouse-control">{translate("i18n.doubleClick")}</span>{' '}{translate("i18n.editAnItem")}</h3>
      <ul>
        <li><span className="manual-mouse-control">{translate("i18n.doubleClick")}</span>{' '}{translate("i18n.anyItemToEditItsFields")}</li>
      </ul>
    </section>
    <section>
      <h3><span className="manual-mouse-control">{translate("i18n.rightClick")}</span>{' '}{translate("i18n.linkItems")}</h3>
      <ul>
        <li><span className="manual-mouse-control">{translate("i18n.rightClick")}</span>{' '}{translate("i18n.anyItemToViewLinksOrUse")}{space}{manualShortcutLabel(shortcuts.createContent)
          ? <kbd>{manualShortcutLabel(shortcuts.createContent)}</kbd>
          : translate("i18n.new")}{space}{translate("i18n.toCreateLinksToOtherItems")}</li>
      </ul>
    </section>
    <section>
      <h3><kbd>{manualShortcutLabel(shortcuts.showOnGlobe) ?? translate("i18n.unassigned")}</kbd>{' '}{translate("i18n.openTheGlobeAndShowMemoryPins")}</h3>
      <ul>
        <li>{translate("i18n.onAnyPage")}{space}{manualShortcutLabel(shortcuts.showOnGlobe)
          ? <>{translate("i18n.press")}{' '}<kbd>{manualShortcutLabel(shortcuts.showOnGlobe)}</kbd></>
          : translate("i18n.assignAKeyInKeyboardShortcutsThen2")}{' '}{translate("i18n.openTheGlobeAndShowMemoryPins2")}</li>
      </ul>
    </section>
    <section>
      <h3><kbd>{manualShortcutLabel(shortcuts.snapshot) ?? translate("i18n.unassigned")}</kbd>{' '}{translate("i18n.saveASnapshotOfItems")}</h3>
      <ul>
        <li>{translate("i18n.onAnyPage")}{space}{manualShortcutLabel(shortcuts.snapshot)
          ? <>{translate("i18n.press")}{' '}<kbd>{manualShortcutLabel(shortcuts.snapshot)}</kbd>{english ? ' to ' : '，'}</>
          : <>{translate("i18n.assignAKeyInKeyboardShortcutsThen3")}{space}</>}{translate("i18n.saveAllItemsOnTheCurrentPage")}</li>
      </ul>
    </section>
  </>;
}

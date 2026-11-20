import { translate, translateError } from '../../i18n/index.js';
import { useState } from 'react';
import { ActionWorkspace } from '../ui.jsx';
import MemoryEditor from './MemoryEditor.jsx';

export default function GlobeEditor({item, catalog, onClose}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = async (action, input) => {
    setBusy(true);
    setError('');
    try {
      const result = await window.cyberStudy.globe(action, input);
      if (result.error) throw new Error(result.error);
      return result;
    } catch (failure) {
      setError(failure.message);
      return null;
    } finally { setBusy(false); }
  };
  const props = {photos: catalog.filter(entry => entry.type === 'memory_point'), busy, request};
  if (item.type === 'journey') return <MemoryEditor {...props} mode="journey" editJourney={item} error={error} onClose={onClose}/>;
  return <ActionWorkspace command={false} showTrigger={false} kind="edit" title={translate("i18n.editMemoryPin")} open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <MemoryEditor {...props} mode="point" initialPoint={item} onSaved={onClose} onDelete={async id => {
      if (window.confirm(translate("i18n.deleteThisMemoryPin")) && await request('update', {ids:[id], patch:{deletedAt:true}})) onClose();
    }}/>
    {error && <p className="workspace-feedback" role="alert">{translateError(error)}</p>}
  </ActionWorkspace>;
}


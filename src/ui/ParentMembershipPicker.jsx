import OrderedMemberPicker from './OrderedMemberPicker.jsx';
import { useSearchCount, useSearchScope } from '../search/useSearchScope.jsx';
import { matchesItem } from '../search/searchCore.js';
import { translate } from '../i18n/index.js';

export default function ParentMembershipPicker({type, parents, selectedIds, updateIds, disabled, workspaceHost}) {
  const playlist = type === 'playlist';
  const legend = translate(playlist ? 'i18n.memberPlaylists' : 'i18n.memberJourneys');
  const scopeId = (workspaceHost ? 'projection:' : '') + type + '-membership';
  const search = useSearchScope({id:scopeId, label:legend, priority:workspaceHost ? 1050 : 70,
    filters:[], hostKey:workspaceHost, searchHost:workspaceHost ? ()=>workspaceHost : undefined});
  const candidates = parents.filter(parent=>matchesItem(type,parent,search));
  useSearchCount(scopeId,candidates.length);
  const byId = new Map(parents.map(parent=>[parent.id,parent]));
  return <OrderedMemberPicker legend={legend} candidates={candidates} selectedIds={selectedIds}
    updateIds={updateIds} disabled={disabled} sortable={false} optionLabel={parent=>parent.title}
    memberTitle={id=>byId.get(id)?.title} confirmRemoval={translate(playlist ? 'i18n.removeSongFromPlaylist' : 'i18n.removeThisPinFromTheTripThe')}/>;
}

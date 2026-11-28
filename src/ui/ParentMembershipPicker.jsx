import OrderedMemberPicker from './OrderedMemberPicker.jsx';
import { translate } from '../i18n/index.js';

export default function ParentMembershipPicker({type, parents, selectedIds, updateIds, disabled, candidates}) {
  const playlist = type === 'playlist';
  const legend = translate(playlist ? 'i18n.memberPlaylists' : 'i18n.memberJourneys');
  const byId = new Map(parents.map(parent=>[parent.id,parent]));
  return <OrderedMemberPicker legend={legend} candidates={candidates} selectedIds={selectedIds}
    updateIds={updateIds} disabled={disabled} sortable={false} optionLabel={parent=>parent.title}
    memberTitle={id=>byId.get(id)?.title} confirmRemoval={translate(playlist ? 'i18n.removeSongFromPlaylist' : 'i18n.removeThisPinFromTheTripThe')}/>;
}

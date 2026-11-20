import MapProjection from './MapProjection.jsx';
import SnapshotCommand from './SnapshotCommand.jsx';

// Command applications share the active result input. The relation graph is an
// inline knowledge-base view and receives that catalog's result set directly.
const commandApplications = [
  ['map', MapProjection],
  ['snapshot', SnapshotCommand]
];

export default function ResultApplications(props) {
  return commandApplications.map(([id, Application]) => <Application key={id} {...props} />);
}

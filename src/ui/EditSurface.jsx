// Keep the diary in the document flow and native dialogs in their existing hosts.
export default function EditSurface({ inline = false, ref, ...props }) {
  if (inline) return <div ref={ref} className="edit-sidebar" {...props} />;
  return <dialog ref={ref} className="action-workspace edit-sidebar" {...props} />;
}

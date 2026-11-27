export default function ImageFileField({ label, children, ...input }) {
  return <>
    <label className="entity-image-field">{label}<input type="file" accept="image/*" {...input} /></label>
    {children}
  </>;
}

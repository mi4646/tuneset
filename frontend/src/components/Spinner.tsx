export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      <div className="spinner-icon" />
      {label && <span>{label}</span>}
    </div>
  );
}

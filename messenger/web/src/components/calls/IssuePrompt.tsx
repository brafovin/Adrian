export function IssuePrompt({ message, confirmLabel, cancelLabel = 'Abbrechen', onConfirm, onCancel }: { message: string; confirmLabel: string; cancelLabel?: string; onConfirm(): void; onCancel(): void }) {
  return (
    <div className="call-issue" role="alert">
      <p>{message}</p>
      <div className="call-issue-actions">
        <button className="btn btn-primary" onClick={onConfirm} autoFocus>{confirmLabel}</button>
        <button className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>
      </div>
    </div>
  );
}

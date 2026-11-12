// Imported creator layers (hair, tattoos) are managed by the asset catalog.
// Until a catalog is connected the manager explains that and closes cleanly.
export default function CustomizationAssetManager({ gender, onClose }) {
  return (
    <div className="cc-panel">
      <p className="cc-hint">
        No imported layers for {gender === 'female' ? 'Eve' : 'Adam'} yet. Layers appear here once they are added to the
        customization catalog.
      </p>
      {onClose && (
        <button type="button" className="cc-chip" onClick={onClose}>
          Back to appearance
        </button>
      )}
    </div>
  );
}